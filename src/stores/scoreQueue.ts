import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import type { Id } from '@/domain/types'

/** What `upsert_score` answers (see supabase/migrations/0005_upsert_score_juror_guard.sql).
 * `wrong_juror`: the tap is not the signed-in caller's; nothing was written. */
export type SaveResult = 'saved' | 'not_open' | 'locked' | 'not_assigned' | 'wrong_juror'

/** Why a queued score was rejected: the server's verdict, or 'invalid' when the server
 * refused the call itself (a client bug such as a bad value), so it can't block the queue. */
export type RejectReason = Exclude<SaveResult, 'saved' | 'wrong_juror'> | 'invalid'

export interface QueuedScore {
  /** `${teamId}:${criterionId}` */
  key: string
  /** Who tapped it: only ever sent under, or shown to, this juror's session. */
  jurorId: Id
  eventId: Id
  teamId: Id
  criterionId: Id
  /** null clears the juror's score for the cell */
  value: number | null
  tappedAt: string
  status: 'pending' | 'rejected'
  reason?: RejectReason
}

/** Sends one score. Resolves with the server's verdict; throws `ScoreRejectedError` when
 * the server permanently refuses the call, and any other error for a transient failure
 * (offline, timeout, 5xx) — those keep the item pending. */
export type SendScore = (q: QueuedScore) => Promise<SaveResult>

/** Thrown by a `SendScore` when retrying the same item can never succeed. */
export class ScoreRejectedError extends Error {
  override name = 'ScoreRejectedError'
}

export const SCORE_QUEUE_STORAGE_KEY = 'shortlist.scoreQueue'

/** Owner given to items persisted before taps recorded their juror (persist v1). No session
 * user ever has this id, so those items are never sent, shown or retried; they are kept in
 * storage (marked rejected 'invalid') rather than deleted, so they can still be recovered by
 * hand. Guessing an owner could send one juror's scores under another's name. */
export const UNKNOWN_JUROR = 'unknown-juror'

type ScoreQueueState = {
  /** Keyed by `queueId`: one item per juror per cell. */
  items: Record<string, QueuedScore>
  /** Latest tap per juror and cell wins. */
  enqueue(input: Omit<QueuedScore, 'key' | 'status' | 'tappedAt' | 'reason'>, now?: Date): void
  /** Sends `jurorId`'s pending items one at a time; stops at the first transient failure.
   * Other jurors' items are left untouched until their owner is signed in again. */
  flush(send: SendScore, jurorId: Id): Promise<void>
  /** Puts `jurorId`'s rejected items for the event back to pending, optionally only those
   * rejected for one of `reasons`. */
  retryRejected(eventId: Id, jurorId: Id, reasons?: readonly RejectReason[]): void
}

export const scoreKey = (teamId: Id, criterionId: Id) => `${teamId}:${criterionId}`

/** The queue's own id for an item: juror plus cell, so two jurors sharing a device never
 * overwrite each other's taps. */
export const queueId = (q: Pick<QueuedScore, 'jurorId' | 'key'>) => `${q.jurorId}/${q.key}`

/** localStorage when it works, memory when it doesn't (private mode, quota, blocked
 * storage): a throwing storage must never take a juror's taps down with it. Memory holds
 * the latest write either way, so it is read first. */
const memory = new Map<string, string>()
function local(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}
const safeStorage: StateStorage = {
  getItem: (name) => {
    const inMemory = memory.get(name)
    if (inMemory !== undefined) return inMemory
    try {
      return local()?.getItem(name) ?? null
    } catch {
      return null
    }
  },
  setItem: (name, value) => {
    memory.set(name, value)
    try {
      local()?.setItem(name, value)
    } catch {
      // Memory still has it for this session.
    }
  },
  removeItem: (name) => {
    memory.delete(name)
    try {
      local()?.removeItem(name)
    } catch {
      // Nothing else to do.
    }
  },
}

/** The flush in progress, shared by every caller so only one runs at a time.
 *
 * Known limitation: this guard is per tab. Two tabs of the same juror each keep their own
 * copy of the queue and persist it last-writer-wins, so a tab can re-send an item the other
 * already synced (harmless: the server keeps the newest tappedAt) or, rarely, overwrite a
 * tap made in the other tab. Jurors use one tab on a phone, so this is accepted. */
let inFlight: Promise<void> | null = null

/** v1 → v2: items gained `jurorId` and are keyed by `queueId`. Legacy items have no known
 * owner, so they are quarantined under UNKNOWN_JUROR (see there), never dropped. */
function migrate(persisted: unknown, version: number): { items: Record<string, QueuedScore> } {
  const state = (persisted ?? {}) as { items?: Record<string, QueuedScore> }
  if (version >= 2) return { items: state.items ?? {} }
  const items: Record<string, QueuedScore> = {}
  for (const legacy of Object.values(state.items ?? {})) {
    const item: QueuedScore = {
      ...legacy,
      jurorId: UNKNOWN_JUROR,
      status: 'rejected',
      reason: 'invalid',
    }
    items[queueId(item)] = item
  }
  return { items }
}

export const useScoreQueue = create<ScoreQueueState>()(
  persist(
    (set, get) => {
      /** Applies `change` to the item only if it is still the exact tap that was sent;
       * a newer tap for the same cell must survive whatever happened to the older one. */
      const settle = (sent: QueuedScore, change: 'remove' | RejectReason) =>
        set((state) => {
          const id = queueId(sent)
          const current = state.items[id]
          if (!current || current.tappedAt !== sent.tappedAt) return state
          const items = { ...state.items }
          if (change === 'remove') delete items[id]
          else items[id] = { ...current, status: 'rejected', reason: change }
          return { items }
        })

      const runFlush = async (send: SendScore, jurorId: Id) => {
        for (;;) {
          const next = Object.values(get().items).find(
            (item) => item.status === 'pending' && item.jurorId === jurorId,
          )
          if (!next) return
          let result: SaveResult
          try {
            result = await send(next)
          } catch (error) {
            if (error instanceof ScoreRejectedError) {
              settle(next, 'invalid')
              continue
            }
            return // Transient: keep everything pending and try again on the next trigger.
          }
          // Not the owner's session (yet): not a verdict on the tap. Keep it pending and stop,
          // like a transient failure; it goes out once its juror's session is active.
          if (result === 'wrong_juror') return
          settle(next, result === 'saved' ? 'remove' : result)
        }
      }

      return {
        items: {},

        enqueue: (input, now = new Date()) =>
          set((state) => {
            const key = scoreKey(input.teamId, input.criterionId)
            const id = queueId({ jurorId: input.jurorId, key })
            const previous = state.items[id]
            // Keep tappedAt strictly increasing per cell (two taps in one millisecond, or a
            // clock stepping back) so a newer tap is always distinguishable from the one in
            // flight, and the server never mistakes it for an older one.
            let tapped = now.getTime()
            if (previous) tapped = Math.max(tapped, new Date(previous.tappedAt).getTime() + 1)
            const item: QueuedScore = {
              ...input,
              key,
              tappedAt: new Date(tapped).toISOString(),
              status: 'pending',
            }
            return { items: { ...state.items, [id]: item } }
          }),

        flush: (send, jurorId) => {
          inFlight ??= runFlush(send, jurorId).finally(() => {
            inFlight = null
          })
          return inFlight
        },

        retryRejected: (eventId, jurorId, reasons) =>
          set((state) => {
            const items = { ...state.items }
            let changed = false
            for (const [id, item] of Object.entries(items)) {
              if (
                item.eventId === eventId &&
                item.jurorId === jurorId &&
                item.status === 'rejected' &&
                (!reasons || (item.reason !== undefined && reasons.includes(item.reason)))
              ) {
                items[id] = { ...item, status: 'pending' }
                delete items[id].reason
                changed = true
              }
            }
            return changed ? { items } : state
          }),
      }
    },
    {
      name: SCORE_QUEUE_STORAGE_KEY,
      version: 2,
      migrate,
      storage: createJSONStorage(() => safeStorage),
      partialize: ({ items }) => ({ items }),
    },
  ),
)
