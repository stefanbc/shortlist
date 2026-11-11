import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Theme } from '@/features/criteria/api'
import { useThemes } from '@/features/criteria/api'
import type { EventRow } from '@/features/events/api'
import { useEvent } from '@/features/events/api'
import {
  useDeleteTeam,
  useReorderTeams,
  useSaveTeam,
  useSetNoShow,
  useTeams,
  type TeamWithProject,
} from './api'
import { TeamsPage } from './TeamsPage'

vi.mock('@/features/events/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/events/api')>()
  return { ...actual, useEvent: vi.fn() }
})

vi.mock('@/features/criteria/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/criteria/api')>()
  return { ...actual, useThemes: vi.fn() }
})

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    useTeams: vi.fn(),
    useSaveTeam: vi.fn(),
    useDeleteTeam: vi.fn(),
    useReorderTeams: vi.fn(),
    useSetNoShow: vi.fn(),
    useImportRegistrations: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
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

const THEMES: Theme[] = [
  { id: 'th-1', name: 'Theme Gamma', position: 1 },
  { id: 'th-2', name: 'Theme Beta', position: 2 },
]

const TEAMS: TeamWithProject[] = [
  {
    id: 't1',
    name: 'Team Vega',
    pitchOrder: 1,
    noShow: false,
    manualTiebreak: null,
    members: ['Ana', 'Bogdan'],
    project: {
      name: 'Project Atlas',
      description: 'A routing app.',
      themeId: 'th-1',
      repoUrl: 'https://github.com/example/project-atlas',
    },
  },
  {
    id: 't2',
    name: 'Team Hydra',
    pitchOrder: 2,
    noShow: false,
    manualTiebreak: null,
    members: [],
    project: { name: null, description: null, themeId: null, repoUrl: null },
  },
]

function renderPage(teams: TeamWithProject[] = TEAMS) {
  vi.mocked(useEvent).mockReturnValue({ data: EVENT, isLoading: false } as never)
  vi.mocked(useThemes).mockReturnValue({ data: THEMES, isLoading: false } as never)
  vi.mocked(useTeams).mockReturnValue({ data: teams, isLoading: false } as never)
  vi.mocked(useReorderTeams).mockReturnValue({ mutate: vi.fn() } as never)

  const router = createMemoryRouter(
    [{ path: '/admin/events/:eventId/teams', element: <TeamsPage /> }],
    { initialEntries: [`/admin/events/${EVENT.id}/teams`] },
  )
  render(<RouterProvider router={router} />)
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('TeamsPage', () => {
  it('shows an invalid repo URL error and does not save', async () => {
    const user = userEvent.setup()
    const saveTeam = vi.fn()
    vi.mocked(useSaveTeam).mockReturnValue({ mutateAsync: saveTeam, isPending: false } as never)
    vi.mocked(useDeleteTeam).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    vi.mocked(useSetNoShow).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)

    renderPage()

    await user.click(screen.getByRole('button', { name: 'Add team' }))
    await user.type(await screen.findByLabelText('Team name'), 'New Team')
    await user.type(screen.getByLabelText(/GitHub repository/), 'not-a-url')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByText('Enter a valid link starting with http:// or https://.'),
    ).toBeInTheDocument()
    expect(saveTeam).not.toHaveBeenCalled()
  })

  it('asks for confirmation before marking a team as no-show', async () => {
    const user = userEvent.setup()
    const setNoShow = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useSaveTeam).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    vi.mocked(useDeleteTeam).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    vi.mocked(useSetNoShow).mockReturnValue({ mutateAsync: setNoShow, isPending: false } as never)

    renderPage()

    await user.click(screen.getByRole('button', { name: 'Mark no-show: Team Vega' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toBeInTheDocument()
    expect(setNoShow).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(setNoShow).toHaveBeenCalledWith({ teamId: 't1', noShow: true }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('cancelling the no-show confirmation does not save', async () => {
    const user = userEvent.setup()
    const setNoShow = vi.fn()
    vi.mocked(useSaveTeam).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    vi.mocked(useDeleteTeam).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    vi.mocked(useSetNoShow).mockReturnValue({ mutateAsync: setNoShow, isPending: false } as never)

    renderPage()

    await user.click(screen.getByRole('button', { name: 'Mark no-show: Team Vega' }))
    await screen.findByRole('alertdialog')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(setNoShow).not.toHaveBeenCalled()
  })

  it('renders the repo URL as a safe, new-tab link', async () => {
    vi.mocked(useSaveTeam).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    vi.mocked(useDeleteTeam).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    vi.mocked(useSetNoShow).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)

    renderPage()

    const link = await screen.findByRole('link', { name: /repository/i })
    expect(link).toHaveAttribute('href', 'https://github.com/example/project-atlas')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('filters the list by search text', async () => {
    const user = userEvent.setup()
    vi.mocked(useSaveTeam).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    vi.mocked(useDeleteTeam).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    vi.mocked(useSetNoShow).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)

    renderPage()

    await user.type(screen.getByLabelText('Search teams'), 'Hydra')

    expect(screen.queryByText('Team Vega')).not.toBeInTheDocument()
    expect(screen.getByText('Team Hydra')).toBeInTheDocument()
  })
})
