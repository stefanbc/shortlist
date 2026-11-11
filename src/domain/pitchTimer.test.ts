import { describe, expect, it } from 'vitest'
import { formatClock, timerView } from './pitchTimer'

const T0 = Date.parse('2026-11-11T10:00:00.000Z')
const at = (ms: number) => new Date(T0 + ms).toISOString()

describe('timerView', () => {
  it('is ready with the full pitch length before it starts', () => {
    expect(timerView(undefined, 7, T0)).toMatchObject({
      phase: 'ready',
      remainingMs: 420_000,
      over: false,
      closing: false,
      progress: 0,
    })
  })

  it('counts down from the start time while running', () => {
    const view = timerView({ durationS: null, startedAt: at(0), elapsedMs: 0 }, 7, T0 + 60_000)
    expect(view).toMatchObject({ phase: 'running', remainingMs: 360_000, closing: false })
  })

  it('keeps the time used across a pause and a resume', () => {
    const paused = { durationS: null, startedAt: null, elapsedMs: 120_000 }
    expect(timerView(paused, 7, T0 + 999_999)).toMatchObject({ phase: 'paused', remainingMs: 300_000 })
    const resumed = { durationS: null, startedAt: at(500_000), elapsedMs: 120_000 }
    expect(timerView(resumed, 7, T0 + 530_000).remainingMs).toBe(270_000)
  })

  it('uses an adjusted length over the event pitch length', () => {
    expect(timerView({ durationS: 450, startedAt: null, elapsedMs: 0 }, 7, T0).remainingMs).toBe(450_000)
  })

  it('flags the closing minute, then overtime', () => {
    const running = { durationS: null, startedAt: at(0), elapsedMs: 0 }
    expect(timerView(running, 7, T0 + 370_000)).toMatchObject({ closing: true, over: false })
    expect(timerView(running, 7, T0 + 425_000)).toMatchObject({
      closing: false,
      over: true,
      remainingMs: -5_000,
      progress: 1,
    })
  })

  it('never shows more than the full time on a device whose clock is behind', () => {
    const running = { durationS: null, startedAt: at(0), elapsedMs: 0 }
    expect(timerView(running, 7, T0 - 3_000).remainingMs).toBe(420_000)
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
