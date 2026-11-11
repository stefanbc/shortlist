import { describe, expect, it } from 'vitest'
import { formatClock, formatDuration, nextTimeOfDay, parseDuration, timerView } from './pitchTimer'

const T0 = Date.parse('2026-11-11T10:00:00.000Z')
const at = (ms: number) => new Date(T0 + ms).toISOString()
const P7 = { pitchMinutes: 7 }

describe('timerView', () => {
  it('is ready with the full pitch length before it starts', () => {
    expect(timerView(undefined, P7, T0)).toMatchObject({
      phase: 'ready',
      remainingMs: 420_000,
      over: false,
      warning: 'none',
      progress: 0,
    })
  })

  it('counts down from the start time while running', () => {
    const view = timerView({ durationS: null, startedAt: at(0), elapsedMs: 0 }, P7, T0 + 60_000)
    expect(view).toMatchObject({ phase: 'running', remainingMs: 360_000, warning: 'none' })
  })

  it('keeps the time used across a pause and a resume', () => {
    const paused = { durationS: null, startedAt: null, elapsedMs: 120_000 }
    expect(timerView(paused, P7, T0 + 999_999)).toMatchObject({ phase: 'paused', remainingMs: 300_000 })
    const resumed = { durationS: null, startedAt: at(500_000), elapsedMs: 120_000 }
    expect(timerView(resumed, P7, T0 + 530_000).remainingMs).toBe(270_000)
  })

  it('uses an adjusted length over the event pitch length', () => {
    expect(timerView({ durationS: 450, startedAt: null, elapsedMs: 0 }, P7, T0).remainingMs).toBe(450_000)
  })

  it('turns yellow, then red, and stays red over time', () => {
    const running = { durationS: null, startedAt: at(0), elapsedMs: 0 }
    expect(timerView(running, P7, T0 + 359_000).warning).toBe('none')
    expect(timerView(running, P7, T0 + 360_000).warning).toBe('yellow')
    expect(timerView(running, P7, T0 + 405_000)).toMatchObject({ warning: 'red', over: false })
    expect(timerView(running, P7, T0 + 425_000)).toMatchObject({
      warning: 'red',
      over: true,
      remainingMs: -5_000,
      progress: 1,
    })
  })

  it('uses the event\'s own wrap-up times', () => {
    const running = { durationS: null, startedAt: at(0), elapsedMs: 0 }
    const settings = { pitchMinutes: 7, yellowS: 120, redS: 30 }
    expect(timerView(running, settings, T0 + 300_000).warning).toBe('yellow')
    expect(timerView(running, settings, T0 + 391_000).warning).toBe('red')
    expect(timerView(running, { pitchMinutes: 7, yellowS: 0, redS: 0 }, T0 + 419_000).warning).toBe('none')
  })

  it('shows no warning before the timer starts, however short it is', () => {
    expect(timerView({ durationS: 30, startedAt: null, elapsedMs: 0 }, P7, T0).warning).toBe('none')
  })

  it('counts down to a target time and cannot be paused', () => {
    const lunch = { durationS: null, startedAt: at(0), elapsedMs: 0, targetAt: at(3_600_000) }
    expect(timerView(lunch, P7, T0 + 900_000)).toMatchObject({
      mode: 'until',
      phase: 'running',
      remainingMs: 2_700_000,
      durationMs: 3_600_000,
      progress: 0.25,
    })
    expect(timerView(lunch, P7, T0 + 3_605_000)).toMatchObject({ over: true, remainingMs: -5_000 })
  })

  it('never shows more than the full time on a device whose clock is behind', () => {
    const running = { durationS: null, startedAt: at(0), elapsedMs: 0 }
    expect(timerView(running, P7, T0 - 3_000).remainingMs).toBe(420_000)
  })
})

describe('formatClock', () => {
  it('rounds up while counting down and counts overtime up from zero', () => {
    expect(formatClock(420_000)).toBe('7:00')
    expect(formatClock(419_001)).toBe('7:00')
    expect(formatClock(419_000)).toBe('6:59')
    expect(formatClock(1)).toBe('0:01')
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(-900)).toBe('0:00')
    expect(formatClock(-65_000)).toBe('1:05')
    expect(formatClock(3_723_000)).toBe('1:02:03')
  })
})

describe('parseDuration / formatDuration', () => {
  it('reads minutes and m:ss, and rejects anything else', () => {
    expect(parseDuration('7')).toBe(420)
    expect(parseDuration(' 7:30 ')).toBe(450)
    expect(parseDuration('0:45')).toBe(45)
    expect(parseDuration('7:75')).toBeNull()
    expect(parseDuration('abc')).toBeNull()
    expect(formatDuration(450)).toBe('7:30')
    expect(formatDuration(45)).toBe('0:45')
  })
})

describe('nextTimeOfDay', () => {
  it('means today when the time is still ahead, tomorrow when it has passed', () => {
    const now = new Date(2026, 10, 11, 12, 15, 0)
    expect(nextTimeOfDay('13:30', now)).toEqual(new Date(2026, 10, 11, 13, 30, 0))
    expect(nextTimeOfDay('09:00', now)).toEqual(new Date(2026, 10, 12, 9, 0, 0))
    expect(nextTimeOfDay('25:00', now)).toBeNull()
  })
})
