import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EventRow } from './api'
import { useEvent, useSaveEvent, useSetEventStatus } from './api'
import { EventSettingsPage } from './EventSettingsPage'

// The set-up overview loads teams, criteria, themes and jurors; these tests are about the forms.
vi.mock('./EventSetupOverview', () => ({ EventSetupOverview: () => null }))

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    useEvent: vi.fn(),
    useSaveEvent: vi.fn(),
    useSetEventStatus: vi.fn(),
    // The wrap-up times card sends timer commands; not what these tests are about.
    useTimerControl: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  }
})

const EVENT: EventRow = {
  id: 'ev-1',
  name: 'Astra Hack',
  startsAt: '2026-01-01T09:00:00.000Z',
  endsAt: '2026-01-01T18:00:00.000Z',
  statusOverride: 'auto',
  lockedAt: null,
  pitchMinutes: 7,
  nowPitchingTeamId: null,
  nowPitchingSince: null,
}

function renderPage(event: EventRow = EVENT) {
  vi.mocked(useEvent).mockReturnValue({ data: event, isLoading: false } as never)

  const router = createMemoryRouter(
    [{ path: '/admin/events/:eventId/settings', element: <EventSettingsPage /> }],
    { initialEntries: [`/admin/events/${event.id}/settings`] },
  )
  render(<RouterProvider router={router} />)
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('EventSettingsPage', () => {
  it('shows a validation error and does not save when ends is before starts', async () => {
    const user = userEvent.setup()
    const saveEvent = vi.fn()
    vi.mocked(useSaveEvent).mockReturnValue({ mutateAsync: saveEvent, isPending: false } as never)
    vi.mocked(useSetEventStatus).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)

    renderPage()

    const endsInput = await screen.findByLabelText('Ends')
    fireEvent.change(endsInput, { target: { value: '2025-12-31T08:00' } })

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByText('The end time must be after the start time.'),
    ).toBeInTheDocument()
    expect(saveEvent).not.toHaveBeenCalled()
  })

  it('asks for confirmation before locking, and only calls set_event_status on confirm', async () => {
    const user = userEvent.setup()
    const setStatus = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useSaveEvent).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    vi.mocked(useSetEventStatus).mockReturnValue({ mutateAsync: setStatus, isPending: false } as never)

    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Lock now' }))

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    expect(setStatus).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(setStatus).toHaveBeenCalledWith({ eventId: 'ev-1', override: 'locked' })
  })
})
