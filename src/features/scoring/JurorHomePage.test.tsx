import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Criterion } from '@/domain/types'
import { useCriteria, useThemes } from '@/features/criteria/api'
import type { EventRow } from '@/features/events/api'
import { useActiveEvent, useEvent, useEvents } from '@/features/events/api'
import type { TeamWithProject } from '@/features/teams/api'
import { useTeams } from '@/features/teams/api'
import { queueId, scoreKey, useScoreQueue, type QueuedScore } from '@/stores/scoreQueue'
import { useSession } from '@/stores/session'
import { useScoreSync } from './api'
import { JurorHomePage } from './JurorHomePage'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
    }),
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}))
vi.mock('@/features/events/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/events/api')>()
  return {
    ...actual,
    useActiveEvent: vi.fn(),
    useEvents: vi.fn(),
    useEvent: vi.fn(),
    useEventUpdates: vi.fn(),
  }
})
vi.mock('@/features/teams/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/teams/api')>()
  return { ...actual, useTeams: vi.fn() }
})
vi.mock('@/features/criteria/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/criteria/api')>()
  return { ...actual, useCriteria: vi.fn(), useThemes: vi.fn() }
})
vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return { ...actual, useScoreSync: vi.fn() }
})

const JUROR = 'juror-1'
const CRITERIA: Criterion[] = Array.from({ length: 9 }, (_, i) => ({
  id: `c${i + 1}`,
  name: `Criterion ${i + 1}`,
  weight: 50,
  position: i + 1,
}))

const team = (id: string, name: string, pitchOrder: number, noShow = false): TeamWithProject => ({
  id,
  name,
  pitchOrder,
  noShow,
  manualTiebreak: null,
  members: [],
  project: { name: `${name} app`, description: null, themeId: null, repoUrl: null },
})
const TEAMS = [
  team('t1', 'Codero', 3),
  team('t2', 'Four the Win', 7),
  team('t3', 'Nimbus', 8),
  team('t4', 'Polynomial', 12, true),
]

const EVENT: EventRow = {
  id: 'ev-1',
  name: 'Astra Hack',
  startsAt: '2000-01-01T08:00:00.000Z',
  endsAt: '2999-01-01T20:00:00.000Z',
  statusOverride: 'auto',
  lockedAt: null,
  pitchMinutes: 7,
  nowPitchingTeamId: 't3',
  nowPitchingSince: '2026-11-10T10:00:00.000Z',
}

function tap(
  teamId: string,
  criterionId: string,
  overrides: Partial<QueuedScore> = {},
): QueuedScore {
  return {
    key: scoreKey(teamId, criterionId),
    jurorId: JUROR,
    eventId: 'ev-1',
    teamId,
    criterionId,
    value: 4,
    tappedAt: '2026-11-10T10:00:00.000Z',
    status: 'pending',
    ...overrides,
  }
}

function renderHome(event: EventRow | null = EVENT) {
  vi.mocked(useActiveEvent).mockReturnValue(event)
  vi.mocked(useEvents).mockReturnValue({ data: event ? [event] : [], isLoading: false } as never)
  vi.mocked(useEvent).mockReturnValue({ data: event ?? undefined } as never)
  vi.mocked(useTeams).mockReturnValue({ data: TEAMS, isLoading: false } as never)
  vi.mocked(useCriteria).mockReturnValue({ data: CRITERIA, isLoading: false } as never)
  vi.mocked(useThemes).mockReturnValue({ data: [], isLoading: false } as never)
  vi.mocked(useScoreSync).mockReturnValue({ pending: 0, rejected: 0, online: true })
  const router = createMemoryRouter(
    [
      { path: '/score', element: <JurorHomePage /> },
      { path: '/score/:eventId/:teamId', element: <p>Scoring screen</p> },
    ],
    { initialEntries: ['/score'] },
  )
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const row = (name: string) =>
  within(screen.getByRole('list', { name: 'Your teams' })).getByRole('link', {
    name: new RegExp(name),
  })

beforeEach(() => {
  useScoreQueue.setState({ items: {} })
  useSession.setState({
    status: 'signedIn',
    profile: { id: JUROR, displayName: 'Ana', email: null, role: 'juror', active: true },
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('JurorHomePage', () => {
  it('lists teams in pitch order with their status, numbered by position', async () => {
    const items = [tap('t1', 'c1'), tap('t1', 'c2'), ...CRITERIA.map((c) => tap('t2', c.id))]
    useScoreQueue.setState({ items: Object.fromEntries(items.map((q) => [queueId(q), q])) })
    renderHome()

    expect(await screen.findByRole('heading', { level: 1, name: 'Your teams' })).toBeInTheDocument()
    const links = within(screen.getByRole('list', { name: 'Your teams' })).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual([
      expect.stringContaining('Codero'),
      expect.stringContaining('Four the Win'),
      expect.stringContaining('Nimbus'),
      expect.stringContaining('Polynomial'),
    ])
    expect(row('Codero')).toHaveTextContent('2/9 scored')
    expect(row('Codero')).toHaveTextContent('1')
    expect(row('Four the Win')).toHaveTextContent('Complete')
    expect(row('Polynomial')).toHaveTextContent('No-show')
    expect(row('Polynomial')).toHaveTextContent('4')
  })

  it('highlights the team now pitching and links straight to it', async () => {
    const user = userEvent.setup()
    const router = renderHome()
    expect(row('Nimbus')).toHaveTextContent('Now pitching')
    expect(row('Nimbus')).toHaveTextContent('Not started')

    await user.click(screen.getByRole('link', { name: 'Score Nimbus' }))
    expect(router.state.location.pathname).toBe('/score/ev-1/t3')
  })

  it('counts a rejected score as not saved, not as scored', () => {
    const rejected = tap('t1', 'c1', { status: 'rejected', reason: 'locked' })
    useScoreQueue.setState({ items: { [queueId(rejected)]: rejected } })
    renderHome()
    expect(row('Codero')).toHaveTextContent('Not started')
    expect(row('Codero')).toHaveTextContent('Not saved: 1')
  })

  it('explains when no event is assigned', () => {
    renderHome(null)
    expect(screen.getByText('No event yet')).toBeInTheDocument()
  })
})
