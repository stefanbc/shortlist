export type EventPhase = 'setup' | 'open' | 'locked'

export type StatusOverride = 'auto' | 'open' | 'locked'

export interface EventTiming {
  startsAt: string
  endsAt: string
  statusOverride: StatusOverride
  lockedAt: string | null
}

/** Minutes after closing during which a late score is still accepted. */
export const GRACE_MINUTES = 15

/**
 * Derives the event's current phase from its dates and manual override.
 * A manual override always wins; otherwise the phase follows the dates,
 * with `now == endsAt` counting as still open (boundary inclusive).
 */
export function eventPhase(e: EventTiming, now: Date): EventPhase {
  if (e.statusOverride === 'open') return 'open'
  if (e.statusOverride === 'locked') return 'locked'

  const startsAt = new Date(e.startsAt)
  const endsAt = new Date(e.endsAt)

  if (now < startsAt) return 'setup'
  if (now <= endsAt) return 'open'
  return 'locked'
}

/**
 * The instant at which scoring closes: the manual lock time when the
 * override is `locked`; for `auto`, the scheduled end -- or `lockedAt` when
 * that is later (an ended event re-opened and then handed back to `auto`,
 * which stamps `lockedAt`); otherwise the scheduled end. Mirrors
 * `public.event_closed_at` (migration 0006).
 */
export function closedAt(e: EventTiming): Date {
  const endsAt = new Date(e.endsAt)
  if (e.lockedAt === null) return endsAt
  const lockedAt = new Date(e.lockedAt)
  if (e.statusOverride === 'locked') return lockedAt
  if (e.statusOverride === 'auto' && lockedAt > endsAt) return lockedAt
  return endsAt
}
