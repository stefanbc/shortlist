/**
 * The shared timer (see supabase/migrations/0008_pitch_timer.sql and 0009_timer_setup.sql).
 * The event row holds a few values; everything a screen shows is derived from them and
 * the current time.
 */
export interface PitchTimer {
  /** Length of this run in seconds; null means the event's pitch length. */
  durationS: number | null
  /** When the current stretch started running (ISO); null while stopped. For a target
   * time, when the countdown was set. */
  startedAt: string | null
  /** Time used before the current stretch, kept across pauses. */
  elapsedMs: number
  /** Count down to this moment (ISO) instead of for a duration. */
  targetAt?: string | null
  /** What the countdown is for when it isn't a team's pitch ("Lunch break"). */
  label?: string | null
}

export const IDLE_TIMER: PitchTimer = {
  durationS: null,
  startedAt: null,
  elapsedMs: 0,
  targetAt: null,
  label: null,
}

/** The event's defaults a timer falls back on. */
export interface TimerSettings {
  pitchMinutes: number
  /** Seconds left at which the clock turns yellow (wrap up). */
  yellowS?: number
  /** Seconds left at which it turns red (stop). */
  redS?: number
}

export const DEFAULT_YELLOW_S = 60
export const DEFAULT_RED_S = 15

export type TimerPhase = 'ready' | 'running' | 'paused'
/** none: plenty of time. yellow: wrap up. red: stop (and everything after zero). */
export type TimerWarning = 'none' | 'yellow' | 'red'

export interface TimerView {
  phase: TimerPhase
  /** `until` counts down to a time of day and can't be paused. */
  mode: 'duration' | 'until'
  durationMs: number
  /** Negative once the time has run out. */
  remainingMs: number
  over: boolean
  warning: TimerWarning
  /** Share of the time used, 0 to 1. */
  progress: number
}

export function timerView(
  timer: PitchTimer | undefined,
  settings: TimerSettings,
  nowMs: number,
): TimerView {
  const { durationS, startedAt, elapsedMs, targetAt } = timer ?? IDLE_TIMER
  const yellowMs = (settings.yellowS ?? DEFAULT_YELLOW_S) * 1000
  const redMs = (settings.redS ?? DEFAULT_RED_S) * 1000

  let phase: TimerPhase
  let durationMs: number
  let remainingMs: number

  if (targetAt) {
    const target = new Date(targetAt).getTime()
    const setAt = startedAt ? new Date(startedAt).getTime() : nowMs
    phase = 'running'
    durationMs = Math.max(0, target - setAt)
    remainingMs = Math.min(target - nowMs, durationMs)
  } else {
    durationMs = (durationS ?? settings.pitchMinutes * 60) * 1000
    // A device whose clock runs behind the server's must not show more time than there is.
    const runningMs = startedAt ? Math.max(0, nowMs - new Date(startedAt).getTime()) : 0
    remainingMs = durationMs - elapsedMs - runningMs
    phase = startedAt ? 'running' : elapsedMs > 0 ? 'paused' : 'ready'
  }

  const over = remainingMs < 0
  const warning: TimerWarning =
    phase === 'ready'
      ? 'none'
      : remainingMs <= redMs
        ? 'red'
        : remainingMs <= yellowMs
          ? 'yellow'
          : 'none'

  return {
    phase,
    mode: targetAt ? 'until' : 'duration',
    durationMs,
    remainingMs,
    over,
    warning,
    progress: durationMs > 0 ? Math.min(1, Math.max(0, 1 - remainingMs / durationMs)) : 1,
  }
}

/** "6:59" while counting down (rounded up, so a full 7:00 shows until a second has
 * passed and 0:00 only at the end); "0:05" of overtime counts up from the end. */
export function formatClock(remainingMs: number): string {
  const total = remainingMs >= 0 ? Math.ceil(remainingMs / 1000) : Math.floor(-remainingMs / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

/** "7:30" or "45" typed by the organizer, as seconds. A bare number is minutes. Null when
 * it isn't a time. */
export function parseDuration(input: string): number | null {
  const text = input.trim()
  if (/^\d{1,3}$/.test(text)) return Number(text) * 60
  const match = /^(\d{1,3}):([0-5]?\d)$/.exec(text)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

/** Seconds as the "m:ss" the organizer types. */
export function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** The next time the clock reads "HH:MM" (today, or tomorrow if that has passed), as a
 * Date. Null when the text isn't a time. */
export function nextTimeOfDay(input: string, now: Date): Date | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(input.trim())
  if (!match) return null
  const target = new Date(now)
  target.setHours(Number(match[1]), Number(match[2]), 0, 0)
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1)
  return target
}
