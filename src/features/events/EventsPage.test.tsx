import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EventRow } from './api'
import { useCopyEvent, useEvents, useSaveEvent } from './api'
import { EventsPage } from './EventsPage'

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    useEvents: vi.fn(),
    useSaveEvent: vi.fn(),
    useCopyEvent: vi.fn(),
  }
})

const PREVIOUS_EVENT: EventRow = {
  id: 'ev-previous',
  name: 'Astra Hack 2025',
  startsAt: '2025-01-01T09:00:00.000Z',
  endsAt: '2025-01-01T18:00:00.000Z',
  statusOverride: 'locked',
  lockedAt: '2025-01-01T18:00:00.000Z',
  pitchMinutes: 7,
  nowPitchingTeamId: null,
  nowPitchingSince: null,
}

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/admin/events', element: <EventsPage /> },
      { path: '/admin/events/:eventId/settings', element: <div>Event settings</div> },
    ],
    { initialEntries: ['/admin/events'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('EventsPage', () => {
  it('copy form calls copy_event_setup with the chosen source id', async () => {
    const user = userEvent.setup()
    vi.mocked(useEvents).mockReturnValue({ data: [PREVIOUS_EVENT], isLoading: false } as never)
    vi.mocked(useSaveEvent).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    const copyEvent = vi.fn().mockResolvedValue('ev-new')
    vi.mocked(useCopyEvent).mockReturnValue({ mutateAsync: copyEvent, isPending: false } as never)

    const router = renderPage()

    await user.click(screen.getByRole('button', { name: 'Copy from event' }))

    const sourceSelect = await screen.findByLabelText('Copy setup from')
    fireEvent.change(sourceSelect, { target: { value: 'ev-previous' } })
    await user.type(screen.getByLabelText('Name'), 'Astra Hack 2026')
    fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '2026-02-01T09:00' } })
    fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2026-02-01T18:00' } })

    await user.click(screen.getByRole('button', { name: 'Create event' }))

    expect(copyEvent).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: 'ev-previous', name: 'Astra Hack 2026' }),
    )
    expect(await screen.findByText('Event settings')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin/events/ev-new/settings')
  })
})
