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
 * override is `locked`, otherwise the scheduled end of the event.
 */
export function closedAt(e: EventTiming): Date {
  if (e.statusOverride === 'locked' && e.lockedAt !== null) {
    return new Date(e.lockedAt)
  }
  return new Date(e.endsAt)
}
