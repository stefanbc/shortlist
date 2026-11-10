import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { eventPhase } from '@/domain/eventPhase'
import type { Id } from '@/domain/types'
import { useEvent } from '@/features/events/api'
import type { Database } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/stores/session'
import {
  ScoreRejectedError,
  scoreKey,
  useScoreQueue,
  type QueuedScore,
  type RejectReason,
  type SaveResult,
  type SendScore,
} from '@/stores/scoreQueue'

/** The juror's own scores for an event, keyed `${teamId}:${criterionId}`. The juror is part
 * of the key so a shared device never shows one juror the previous juror's cached scores;
 * `myScoresKey(eventId)` alone is the prefix that invalidates them all. */
export const myScoresKey = (eventId: Id, jurorId?: Id) =>
  jurorId ? (['scores', 'mine', eventId, jurorId] as const) : (['scores', 'mine', eventId] as const)

/** A send that hangs (flaky venue wifi) must not wedge the queue: give up and retry later. */
const SEND_TIMEOUT_MS = 15_000
const SYNC_INTERVAL_MS = 10_000

/** Rejections worth re-sending on every tick while the event shows open: the client's view
 * says the server should now accept them (clock skew near starts_at, a juror assigned a
 * moment later). 'invalid' is deliberately excluded — the server refused that exact call,
 * so re-sending it every 10 s only adds load; it is retried once when the event (re)opens. */
const RETRY_WHILE_OPEN: readonly RejectReason[] = ['not_open', 'not_assigned']

/** `AbortSignal.timeout`, or a timer-driven controller where it's missing (Safari < 16):
 * without it every send would throw and the queue would be "transient forever". Call
 * `clear()` once the request settles so the fallback timer doesn't linger. */
export function timeoutSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  if (typeof AbortSignal.timeout === 'function') {
    return { signal: AbortSignal.timeout(ms), clear: () => {} }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return { signal: controller.signal, clear: () => clearTimeout(timer) }
}

const SAVE_RESULTS: ReadonlySet<string> = new Set<SaveResult>([
  'saved',
  'not_open',
  'locked',
  'not_assigned',
  'wrong_juror',
])

type UpsertScoreArgs = Omit<Database['public']['Functions']['upsert_score']['Args'], 'p_value'> & {
  p_value: number | null
}

async function rpcUpsertScore(args: UpsertScoreArgs) {
  const timeout = timeoutSignal(SEND_TIMEOUT_MS)
  try {
    return await supabase
      .rpc(
        'upsert_score',
        // The generated Args type says `p_value: number`, but the SQL function accepts null
        // to clear the juror's score for the cell (see supabase/migrations/0005_*.sql).
        args as Database['public']['Functions']['upsert_score']['Args'],
      )
      .abortSignal(timeout.signal)
  } finally {
    timeout.clear()
  }
}

/** No response (offline, timeout, abort), an auth problem (401/403 — expired or swapped
 * session; it hits every item alike, so holding the queue loses nothing), rate limiting or a
 * server hiccup: worth retrying. Any other error response means the call itself is wrong. */
function isTransient(status: number): boolean {
  return (
    status === 0 ||
    status === 401 ||
    status === 403 ||
    status === 408 ||
    status === 429 ||
    status >= 500
  )
}

export const sendScore: SendScore = async (q) => {
  // The request goes out with whatever token the client holds *now*. Check that against the
  // auth session itself (the profile store updates asynchronously after an auth switch);
  // the server re-checks p_juror against auth.uid() and answers 'wrong_juror' too.
  const { data: auth } = await supabase.auth.getSession()
  if (auth.session?.user.id !== q.jurorId) return 'wrong_juror'

  const { data, error, status } = await rpcUpsertScore({
    p_team: q.teamId,
    p_criterion: q.criterionId,
    p_value: q.value,
    p_tapped_at: q.tappedAt,
    p_juror: q.jurorId,
  })
  if (error) {
    if (isTransient(status)) throw new Error(`upsert_score failed (${status}): ${error.message}`)
    throw new ScoreRejectedError(error.message)
  }
  if (!SAVE_RESULTS.has(data))
    throw new ScoreRejectedError(`unexpected upsert_score result: ${data}`)
  return data as SaveResult
}

/** Applies queued taps for the event over the server's scores: the queue wins (pending or
 * rejected, it is still what the juror tapped) and a queued null removes the score. */
function overlayQueue(
  server: Record<string, number>,
  items: Record<string, QueuedScore>,
  eventId: Id,
  jurorId: Id | undefined,
): Record<string, number> {
  const merged = { ...server }
  for (const item of Object.values(items)) {
    if (item.eventId !== eventId || item.jurorId !== jurorId) continue
    if (item.value === null) delete merged[item.key]
    else merged[item.key] = item.value
  }
  return merged
}

export function useMyScores(eventId: Id): Record<string, number> {
  const jurorId = useSession((state) => state.profile?.id)
  const { data } = useQuery({
    queryKey: myScoresKey(eventId, jurorId),
    queryFn: async () => {
      // RLS returns only the signed-in juror's own rows.
      const { data, error } = await supabase
        .from('scores')
        .select('team_id, criterion_id, value')
        .eq('event_id', eventId)
      if (error) throw error
      const scores: Record<string, number> = {}
      for (const row of data) scores[scoreKey(row.team_id, row.criterion_id)] = row.value
      return scores
    },
    enabled: Boolean(eventId && jurorId),
  })
  const items = useScoreQueue((state) => state.items)
  return useMemo(
    () => overlayQueue(data ?? {}, items, eventId, jurorId),
    [data, items, eventId, jurorId],
  )
}

const hasPending = (items: Record<string, QueuedScore>, jurorId: Id) =>
  Object.values(items).some((item) => item.status === 'pending' && item.jurorId === jurorId)

/** Keeps the score queue flowing to the server while mounted, and reports its state for
 * the sync indicator. */
export function useScoreSync(eventId: Id): { pending: number; rejected: number; online: boolean } {
  const queryClient = useQueryClient()
  const jurorId = useSession((state) => state.profile?.id)
  const items = useScoreQueue((state) => state.items)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [now, setNow] = useState(() => new Date())
  const { data: event } = useEvent(eventId)

  const flush = useCallback(async () => {
    if (!jurorId) return
    const savedEvents = new Set<Id>()
    await useScoreQueue.getState().flush(async (q) => {
      // sendScore answers 'wrong_juror' if the session is no longer q's juror; the queue
      // then keeps the item pending and stops.
      const result = await sendScore(q)
      if (result === 'saved') {
        savedEvents.add(q.eventId)
        // Write the value into the cache before the queue drops the item, so the cell
        // never flickers back to the old server value while the refetch is in flight.
        queryClient.setQueryData<Record<string, number>>(
          myScoresKey(q.eventId, q.jurorId),
          (old) => {
            if (!old) return old
            const next = { ...old }
            if (q.value === null) delete next[q.key]
            else next[q.key] = q.value
            return next
          },
        )
      }
      return result
    }, jurorId)
    for (const id of savedEvents) void queryClient.invalidateQueries({ queryKey: myScoresKey(id) })
  }, [queryClient, jurorId])

  // On mount or sign-in (anything left from a previous session) and after every change that
  // leaves something pending: a new tap, or rejected taps put back by retryRejected.
  useEffect(() => {
    if (!jurorId) return
    if (hasPending(useScoreQueue.getState().items, jurorId)) void flush()
    return useScoreQueue.subscribe((state, prev) => {
      if (state.items !== prev.items && hasPending(state.items, jurorId)) void flush()
    })
  }, [flush, jurorId])

  useEffect(() => {
    const onOnline = () => {
      setOnline(true)
      void flush()
    }
    const onOffline = () => setOnline(false)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void flush()
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [flush])

  useEffect(() => {
    const interval = setInterval(() => {
      // Also re-evaluates the event phase, which can flip by time alone.
      const tickNow = new Date()
      setNow(tickNow)
      // While open, retry rejections the open phase should have cleared.
      if (event && jurorId && eventPhase(event, tickNow) === 'open') {
        useScoreQueue.getState().retryRejected(eventId, jurorId, RETRY_WHILE_OPEN)
      }
      void flush()
    }, SYNC_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [flush, event, eventId, jurorId])

  const phase = event ? eventPhase(event, now) : null
  // Becoming open (or signing in while open): retry every rejection once.
  useEffect(() => {
    if (phase === 'open' && jurorId) useScoreQueue.getState().retryRejected(eventId, jurorId)
  }, [phase, eventId, jurorId])

  let pending = 0
  let rejected = 0
  for (const item of Object.values(items)) {
    if (item.eventId !== eventId || item.jurorId !== jurorId) continue
    if (item.status === 'pending') pending++
    else rejected++
  }
  return { pending, rejected, online }
}
