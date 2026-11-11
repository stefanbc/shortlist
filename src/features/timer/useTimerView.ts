import { useEffect, useState } from 'react'
import { timerView, type PitchTimer, type TimerView } from '@/domain/pitchTimer'

/** The parts of an event the timer reads. */
export type TimerSource = {
  timer?: PitchTimer
  pitchMinutes: number
  timerYellowS?: number
  timerRedS?: number
}

/** The shared timer as it reads right now. Re-renders four times a second while the
 * timer runs (so the second never visibly skips) and not at all while it is stopped. */
export function useTimerView(source: TimerSource): TimerView {
  const [now, setNow] = useState(() => Date.now())
  const ticking = Boolean(source.timer?.startedAt || source.timer?.targetAt)
  const key = `${source.timer?.startedAt}|${source.timer?.targetAt}`

  useEffect(() => {
    const tick = () => setNow(Date.now())
    // Catch up straight away: the timer may have started long after this screen opened.
    const first = setTimeout(tick, 0)
    if (!ticking) return () => clearTimeout(first)
    const id = setInterval(tick, 250)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [ticking, key])

  return timerView(
    source.timer,
    { pitchMinutes: source.pitchMinutes, yellowS: source.timerYellowS, redS: source.timerRedS },
    now,
  )
}
