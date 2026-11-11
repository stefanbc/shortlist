/**
 * The shared pitch timer (see supabase/migrations/0008_pitch_timer.sql). The event row
 * holds three values; everything a screen shows is derived from them and the current time.
 */
export interface PitchTimer {
  /** Length of this run in seconds; null means the event's pitch length. */
  durationS: number | null
  /** When the current stretch started running (ISO); null while stopped. */
  startedAt: string | null
  /** Time used before the current stretch, kept across pauses. */
  elapsedMs: number
}

export const IDLE_TIMER: PitchTimer = { durationS: null, startedAt: null, elapsedMs: 0 }

export type TimerPhase = 'ready' | 'running' | 'paused'

export interface TimerView {
  phase: TimerPhase
  durationMs: number
  /** Negative once the pitch has run over. */
  remainingMs: number
  over: boolean
  /** The last stretch of the pitch (under a minute, or under a fifth of a short one). */
  closing: boolean
  /** Share of the time used, 0 to 1. */
  progress: number
}

export function timerView(
  timer: PitchTimer | undefined,
  pitchMinutes: number,
  nowMs: number,
): TimerView {
  const { durationS, startedAt, elapsedMs } = timer ?? IDLE_TIMER
  const durationMs = (durationS ?? pitchMinutes * 60) * 1000
  // A device whose clock runs behind the server's must not show more time than there is.
  const runningMs = startedAt ? Math.max(0, nowMs - new Date(startedAt).getTime()) : 0
  const usedMs = elapsedMs + runningMs
  const remainingMs = durationMs - usedMs
  const phase: TimerPhase = startedAt ? 'running' : elapsedMs > 0 ? 'paused' : 'ready'
  const over = remainingMs < 0
  return {
    phase,
    durationMs,
    remainingMs,
    over,
    closing: !over && phase !== 'ready' && remainingMs <= Math.min(60_000, durationMs / 5),
    progress: durationMs > 0 ? Math.min(1, Math.max(0, usedMs / durationMs)) : 1,
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
