import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PitchTimer } from './PitchTimer'

afterEach(() => {
  vi.useRealTimers()
})

describe('PitchTimer', () => {
  it('shows the full pitch time the moment the juror starts it, however long the screen was open', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-10T10:00:00.000Z'))
    render(<PitchTimer pitchMinutes={7} onStageSince={null} />)

    vi.setSystemTime(new Date('2026-11-10T10:10:00.000Z'))
    fireEvent.click(screen.getByRole('button', { name: 'Start 7-min timer' }))

    expect(screen.getByRole('timer')).toHaveTextContent(/^7:00 left$/)
    act(() => vi.advanceTimersByTime(61_000))
    expect(screen.getByRole('timer')).toHaveTextContent(/^5:59 left$/)
  })

  it('counts down from the organizer’s now-pitching moment for the team on stage', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-10T10:03:00.000Z'))
    render(<PitchTimer pitchMinutes={7} onStageSince="2026-11-10T10:00:00.000Z" />)
    act(() => vi.advanceTimersByTime(0))
    expect(screen.getByRole('timer')).toHaveTextContent(/^4:00 left$/)
    act(() => vi.advanceTimersByTime(5 * 60_000))
    expect(screen.getByRole('timer')).toHaveTextContent(/^1:00 over$/)
  })
})
