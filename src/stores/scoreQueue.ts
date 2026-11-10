import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import type { Id } from '@/domain/types'

/** What `upsert_score` answers (see supabase/migrations/0003_rpc.sql). */
export type SaveResult = 'saved' | 'not_open' | 'locked' | 'not_assigned'

/** Why a queued score was rejected: the server's verdict, or 'invalid' when the server
 * refused the call itself (a client bug such as a bad value), so it can't block the queue. */
export type RejectReason = Exclude<SaveResult, 'saved'> | 'invalid'

export interface QueuedScore {
  /** `${teamId}:${criterionId}` */
  key: string
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

type ScoreQueueState = {
  items: Record<string, QueuedScore>
  /** Latest tap per key wins. */
  enqueue(input: Omit<QueuedScore, 'key' | 'status' | 'tappedAt'>, now?: Date): void
  /** Sends pending items one at a time; stops at the first transient failure. */
  flush(send: SendScore): Promise<void>
  /** Puts an event's rejected items back to pending (e.g. once the event reopens). */
  retryRejected(eventId: Id): void
}

export const scoreKey = (teamId: Id, criterionId: Id) => `${teamId}:${criterionId}`

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

/** The flush in progress, shared by every caller so only one runs at a time. */
let inFlight: Promise<void> | null = null

export const useScoreQueue = create<ScoreQueueState>()(
  persist(
    (set, get) => {
      /** Applies `change` to the item only if it is still the exact tap that was sent;
       * a newer tap for the same cell must survive whatever happened to the older one. */
      const settle = (sent: QueuedScore, change: 'remove' | RejectReason) =>
        set((state) => {
          const current = state.items[sent.key]
          if (!current || current.tappedAt !== sent.tappedAt) return state
          const items = { ...state.items }
          if (change === 'remove') delete items[sent.key]
          else items[sent.key] = { ...current, status: 'rejected', reason: change }
          return { items }
        })

      const runFlush = async (send: SendScore) => {
        for (;;) {
          const next = Object.values(get().items).find((item) => item.status === 'pending')
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
          settle(next, result === 'saved' ? 'remove' : result)
        }
      }

      return {
        items: {},

        enqueue: (input, now = new Date()) =>
          set((state) => {
            const key = scoreKey(input.teamId, input.criterionId)
            const previous = state.items[key]
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
            return { items: { ...state.items, [key]: item } }
          }),

        flush: (send) => {
          inFlight ??= runFlush(send).finally(() => {
            inFlight = null
          })
          return inFlight
        },

        retryRejected: (eventId) =>
          set((state) => {
            const items = { ...state.items }
            let changed = false
            for (const item of Object.values(items)) {
              if (item.eventId === eventId && item.status === 'rejected') {
                items[item.key] = { ...item, status: 'pending' }
                delete items[item.key].reason
                changed = true
              }
            }
            return changed ? { items } : state
          }),
      }
    },
    {
      name: SCORE_QUEUE_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: ({ items }) => ({ items }),
    },
  ),
)
