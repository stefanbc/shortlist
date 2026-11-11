import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EventRow } from '@/features/events/api'
import { useEvent } from '@/features/events/api'
import type { Profile } from '@/stores/session'
import { useAssignJuror, useEventJurors, useProfiles, useUnassignJuror } from './api'
import { EventJurorsPage } from './EventJurorsPage'

vi.mock('@/features/events/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/events/api')>()
  return { ...actual, useEvent: vi.fn() }
})

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    useEventJurors: vi.fn(),
    useProfiles: vi.fn(),
    useAssignJuror: vi.fn(),
    useUnassignJuror: vi.fn(),
  }
})

const EVENT: EventRow = {
  id: 'ev-1',
  name: 'Astra Hack',
  startsAt: '2099-01-01T09:00:00.000Z',
  endsAt: '2099-01-01T18:00:00.000Z',
  statusOverride: 'auto',
  lockedAt: null,
  pitchMinutes: 7,
  nowPitchingTeamId: null,
  nowPitchingSince: null,
}

const ALEX: Profile = {
  id: 'j-alex',
  displayName: 'Alex Example',
  email: 'alex@example.com',
  role: 'juror',
  active: true,
}
const SAM: Profile = {
  id: 'j-sam',
  displayName: 'Sam Sample',
  email: null,
  role: 'juror',
  active: true,
}

function renderPage({
  assigned = [ALEX],
  allProfiles = [ALEX, SAM],
}: {
  assigned?: Profile[]
  allProfiles?: Profile[]
} = {}) {
  vi.mocked(useEvent).mockReturnValue({ data: EVENT, isLoading: false } as never)
  vi.mocked(useEventJurors).mockReturnValue({ data: assigned, isLoading: false } as never)
  vi.mocked(useProfiles).mockReturnValue({ data: allProfiles, isLoading: false } as never)

  const router = createMemoryRouter(
    [{ path: '/admin/events/:eventId/jurors', element: <EventJurorsPage /> }],
    { initialEntries: [`/admin/events/${EVENT.id}/jurors`] },
  )
  render(<RouterProvider router={router} />)
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('EventJurorsPage', () => {
  it('removing a juror warns that their existing scores stay counted', async () => {
    const user = userEvent.setup()
    const unassign = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useAssignJuror).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    vi.mocked(useUnassignJuror).mockReturnValue({ mutateAsync: unassign, isPending: false } as never)

    renderPage()

    await user.click(screen.getByRole('button', { name: 'Remove from event: Alex Example' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(/stay counted in the results/)
    expect(unassign).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Remove from event' }))

    await waitFor(() =>
      expect(unassign).toHaveBeenCalledWith({ eventId: 'ev-1', jurorId: 'j-alex' }),
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('assigns a juror picked from the list of active, unassigned jurors', async () => {
    const user = userEvent.setup()
    const assign = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useAssignJuror).mockReturnValue({ mutateAsync: assign, isPending: false } as never)
    vi.mocked(useUnassignJuror).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)

    renderPage()

    await user.click(screen.getAllByRole('button', { name: 'Assign juror' })[0])
    const dialog = await screen.findByRole('dialog')
    await user.selectOptions(within(dialog).getByLabelText('Juror'), 'j-sam')
    await user.click(within(dialog).getByRole('button', { name: 'Assign juror' }))

    await waitFor(() => expect(assign).toHaveBeenCalledWith({ eventId: 'ev-1', jurorId: 'j-sam' }))
  })
})
