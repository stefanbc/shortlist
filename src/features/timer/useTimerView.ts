import { useEffect, useState } from 'react'
import { timerView, type PitchTimer, type TimerView } from '@/domain/pitchTimer'

/** The shared timer as it reads right now. Re-renders four times a second while the
 * timer runs (so the second never visibly skips) and not at all while it is stopped. */
export function useTimerView(timer: PitchTimer | undefined, pitchMinutes: number): TimerView {
  const [now, setNow] = useState(() => Date.now())
  const startedAt = timer?.startedAt ?? null

  useEffect(() => {
    const tick = () => setNow(Date.now())
    // Catch up straight away: the timer may have started long after this screen opened.
    const first = setTimeout(tick, 0)
    if (!startedAt) return () => clearTimeout(first)
    const id = setInterval(tick, 250)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [startedAt])

  return timerView(timer, pitchMinutes, now)
}
