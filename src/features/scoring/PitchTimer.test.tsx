import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PitchTimer } from './PitchTimer'

afterEach(() => {
  vi.useRealTimers()
})

describe('PitchTimer', () => {
  it('shows nothing, and offers no way to start a timer, for a team that is not on stage', () => {
    render(<PitchTimer shared={null} />)
    expect(screen.queryByRole('timer')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('mirrors the organizer’s timer for the team on stage: ready, running, over', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-10T10:03:00.000Z'))
    const { rerender } = render(
      <PitchTimer shared={{ pitchMinutes: 7, timer: { durationS: null, startedAt: null, elapsedMs: 0 } }} />,
    )
    expect(screen.getByRole('timer')).toHaveTextContent(/^7:00 to pitch$/)

    rerender(
      <PitchTimer
        shared={{
          pitchMinutes: 7,
          timer: { durationS: null, startedAt: '2026-11-10T10:00:00.000Z', elapsedMs: 0 },
        }}
      />,
    )
    act(() => vi.advanceTimersByTime(0))
    expect(screen.getByRole('timer')).toHaveTextContent(/^4:00 left$/)
    act(() => vi.advanceTimersByTime(5 * 60_000))
    expect(screen.getByRole('timer')).toHaveTextContent(/^1:00 over$/)
  })

  it('holds the time while the organizer has it paused', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-10T10:03:00.000Z'))
    render(
      <PitchTimer
        shared={{ pitchMinutes: 7, timer: { durationS: null, startedAt: null, elapsedMs: 120_000 } }}
      />,
    )
    act(() => vi.advanceTimersByTime(60_000))
    expect(screen.getByRole('timer')).toHaveTextContent(/^5:00 left, paused$/)
  })
})
