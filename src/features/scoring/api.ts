import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { eventPhase } from '@/domain/eventPhase'
import type { Id } from '@/domain/types'
import { useEvent } from '@/features/events/api'
import type { Database } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import {
  ScoreRejectedError,
  scoreKey,
  useScoreQueue,
  type QueuedScore,
  type SaveResult,
  type SendScore,
} from '@/stores/scoreQueue'

/** The juror's own scores for an event, keyed `${teamId}:${criterionId}`. */
export const myScoresKey = (eventId: Id) => ['scores', 'mine', eventId] as const

/** A send that hangs (flaky venue wifi) must not wedge the queue: give up and retry later. */
const SEND_TIMEOUT_MS = 15_000
const SYNC_INTERVAL_MS = 10_000

const SAVE_RESULTS: ReadonlySet<string> = new Set<SaveResult>([
  'saved',
  'not_open',
  'locked',
  'not_assigned',
])

type UpsertScoreArgs = Omit<Database['public']['Functions']['upsert_score']['Args'], 'p_value'> & {
  p_value: number | null
}

function rpcUpsertScore(args: UpsertScoreArgs) {
  return supabase
    .rpc(
      'upsert_score',
      // The generated Args type says `p_value: number`, but the SQL function accepts null
      // to clear the juror's score for the cell (see supabase/migrations/0003_rpc.sql).
      args as Database['public']['Functions']['upsert_score']['Args'],
    )
    .abortSignal(AbortSignal.timeout(SEND_TIMEOUT_MS))
}

/** No response (offline, timeout, abort), an expired session, rate limiting or a server
 * hiccup: worth retrying. Any other error response means the call itself is wrong. */
function isTransient(status: number): boolean {
  return status === 0 || status === 401 || status === 408 || status === 429 || status >= 500
}

export const sendScore: SendScore = async (q) => {
  const { data, error, status } = await rpcUpsertScore({
    p_team: q.teamId,
    p_criterion: q.criterionId,
    p_value: q.value,
    p_tapped_at: q.tappedAt,
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
): Record<string, number> {
  const merged = { ...server }
  for (const item of Object.values(items)) {
    if (item.eventId !== eventId) continue
    if (item.value === null) delete merged[item.key]
    else merged[item.key] = item.value
  }
  return merged
}

export function useMyScores(eventId: Id): Record<string, number> {
  const { data } = useQuery({
    queryKey: myScoresKey(eventId),
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
    enabled: Boolean(eventId),
  })
  const items = useScoreQueue((state) => state.items)
  return useMemo(() => overlayQueue(data ?? {}, items, eventId), [data, items, eventId])
}

const hasPending = (items: Record<string, QueuedScore>) =>
  Object.values(items).some((item) => item.status === 'pending')

/** Keeps the score queue flowing to the server while mounted, and reports its state for
 * the sync indicator. */
export function useScoreSync(eventId: Id): { pending: number; rejected: number; online: boolean } {
  const queryClient = useQueryClient()
  const items = useScoreQueue((state) => state.items)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [now, setNow] = useState(() => new Date())
  const { data: event } = useEvent(eventId)

  const flush = useCallback(async () => {
    let saved = false
    await useScoreQueue.getState().flush(async (q) => {
      const result = await sendScore(q)
      if (result === 'saved') {
        saved = true
        // Write the value into the cache before the queue drops the item, so the cell
        // never flickers back to the old server value while the refetch is in flight.
        queryClient.setQueryData<Record<string, number>>(myScoresKey(q.eventId), (old) => {
          if (!old) return old
          const next = { ...old }
          if (q.value === null) delete next[q.key]
          else next[q.key] = q.value
          return next
        })
      }
      return result
    })
    if (saved) void queryClient.invalidateQueries({ queryKey: myScoresKey(eventId) })
  }, [queryClient, eventId])

  // On mount (anything left from a previous session) and after every change that leaves
  // something pending: a new tap, or rejected taps put back by retryRejected.
  useEffect(() => {
    if (hasPending(useScoreQueue.getState().items)) void flush()
    return useScoreQueue.subscribe((state, prev) => {
      if (state.items !== prev.items && hasPending(state.items)) void flush()
    })
  }, [flush])

  useEffect(() => {
    const onOnline = () => {
      setOnline(true)
      void flush()
    }
    const onOffline = () => setOnline(false)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void flush()
    }
    const interval = setInterval(() => {
      // Also re-evaluates the event phase, which can flip by time alone.
      setNow(new Date())
      void flush()
    }, SYNC_INTERVAL_MS)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(interval)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [flush])

  const phase = event ? eventPhase(event, now) : null
  useEffect(() => {
    if (phase === 'open') useScoreQueue.getState().retryRejected(eventId)
  }, [phase, eventId])

  let pending = 0
  let rejected = 0
  for (const item of Object.values(items)) {
    if (item.eventId !== eventId) continue
    if (item.status === 'pending') pending++
    else rejected++
  }
  return { pending, rejected, online }
}
