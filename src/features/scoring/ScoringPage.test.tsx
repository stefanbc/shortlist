import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Criterion } from '@/domain/types'
import type { Theme } from '@/features/criteria/api'
import { useCriteria, useThemes } from '@/features/criteria/api'
import type { EventRow } from '@/features/events/api'
import { useEvent } from '@/features/events/api'
import type { TeamWithProject } from '@/features/teams/api'
import { useTeams } from '@/features/teams/api'
import { queueId, scoreKey, useScoreQueue, type QueuedScore } from '@/stores/scoreQueue'
import { useSession } from '@/stores/session'
import { useMyNote, useSaveNote, useScoreSync } from './api'
import { ScoringPage } from './ScoringPage'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      // The juror's server-side scores: none yet.
      select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
    }),
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}))

vi.mock('@/features/events/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/events/api')>()
  return { ...actual, useEvent: vi.fn(), useEventUpdates: vi.fn() }
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
  return { ...actual, useScoreSync: vi.fn(), useMyNote: vi.fn(), useSaveNote: vi.fn() }
})

const JUROR = 'juror-1'

const CRITERIA: Criterion[] = [
  'Încadrarea în temă',
  'Originalitate și Utilitate',
  'Potențial business',
  'Impact social',
  '% implementare',
  'Calitatea soluției',
  'Arhitectură',
  'Nice to have',
  'Prezentare',
].map((name, i) => ({ id: `c${i + 1}`, name, weight: 90 - i * 5, position: i + 1 }))

const THEMES: Theme[] = [{ id: 'th-1', name: 'Sustainability', position: 1 }]

const team = (id: string, name: string, pitchOrder: number, noShow = false): TeamWithProject => ({
  id,
  name,
  pitchOrder,
  noShow,
  manualTiebreak: null,
  members: [],
  project: { name: `${name} app`, description: null, themeId: 'th-1', repoUrl: null },
})

// Pitch orders have a gap on purpose: position in the list, not pitchOrder, is "Team n".
const TEAMS = [
  team('t1', 'Codero', 2),
  team('t2', 'Four the Win', 5),
  team('t3', 'Nimbus', 9, true),
]

const openEvent = (overrides: Partial<EventRow> = {}): EventRow => ({
  id: 'ev-1',
  name: 'Astra Hack',
  startsAt: '2000-01-01T08:00:00.000Z',
  endsAt: '2999-01-01T20:00:00.000Z',
  statusOverride: 'auto',
  lockedAt: null,
  pitchMinutes: 7,
  nowPitchingTeamId: null,
  nowPitchingSince: null,
  ...overrides,
})

function renderPage({
  event = openEvent(),
  teamId = 't1',
  sync = { pending: 0, rejected: 0, online: true },
}: { event?: EventRow; teamId?: string; sync?: ReturnType<typeof useScoreSync> } = {}) {
  vi.mocked(useEvent).mockReturnValue({ data: event, isLoading: false } as never)
  vi.mocked(useTeams).mockReturnValue({ data: TEAMS, isLoading: false } as never)
  vi.mocked(useCriteria).mockReturnValue({ data: CRITERIA, isLoading: false } as never)
  vi.mocked(useThemes).mockReturnValue({ data: THEMES, isLoading: false } as never)
  vi.mocked(useScoreSync).mockReturnValue(sync)
  vi.mocked(useMyNote).mockReturnValue({ data: '', isSuccess: true } as never)
  vi.mocked(useSaveNote).mockReturnValue({ save: vi.fn(), flush: vi.fn(), status: 'idle' })

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/score/:eventId/:teamId', element: <ScoringPage /> },
      { path: '/score', element: <p>Team list</p> },
    ],
    { initialEntries: [`/score/ev-1/${teamId}`] },
  )
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const queued = (criterionId: string) =>
  useScoreQueue.getState().items[queueId({ jurorId: JUROR, key: scoreKey('t1', criterionId) })]

const currentCriterion = (name: string) => screen.findByRole('heading', { level: 2, name })

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

describe('ScoringPage', () => {
  it('shows the team header with its position in the list, project and theme', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Codero' })).toBeInTheDocument()
    expect(screen.getByText('Team 1 / 3')).toBeInTheDocument()
    expect(screen.getByText('Codero app')).toBeInTheDocument()
    expect(screen.getByText('Sustainability')).toBeInTheDocument()
  })

  it('tap 3.5 enqueues and advances to next criterion', async () => {
    const user = userEvent.setup()
    renderPage()
    await currentCriterion('Încadrarea în temă')

    await user.click(screen.getByRole('button', { name: '3.5' }))

    expect(queued('c1')).toMatchObject({
      eventId: 'ev-1',
      teamId: 't1',
      criterionId: 'c1',
      value: 3.5,
      jurorId: JUROR,
      status: 'pending',
    })
    expect(await currentCriterion('Originalitate și Utilitate')).toBeInTheDocument()
  })

  it('strip tile jumps to criterion', async () => {
    const user = userEvent.setup()
    renderPage()
    await currentCriterion('Încadrarea în temă')

    const strip = screen.getByRole('navigation', { name: 'Criteria' })
    await user.click(within(strip).getByRole('button', { name: /^Criterion 3/ }))

    expect(await currentCriterion('Potențial business')).toBeInTheDocument()
  })

  it('keys: 3 then . sets 3.5; Backspace clears; ArrowDown moves', async () => {
    const user = userEvent.setup()
    renderPage()
    await currentCriterion('Încadrarea în temă')

    await user.keyboard('3')
    expect(queued('c1')?.value).toBe(3)
    await user.keyboard('.')
    expect(queued('c1')?.value).toBe(3.5)
    // Keys never auto-advance.
    expect(
      screen.getByRole('heading', { level: 2, name: 'Încadrarea în temă' }),
    ).toBeInTheDocument()

    await user.keyboard('{Backspace}')
    expect(queued('c1')?.value).toBeNull()

    await user.keyboard('{ArrowDown}')
    expect(await currentCriterion('Originalitate și Utilitate')).toBeInTheDocument()
  })

  it('5 then . stays 5', async () => {
    const user = userEvent.setup()
    renderPage()
    await currentCriterion('Încadrarea în temă')

    await user.keyboard('5.')
    expect(queued('c1')?.value).toBe(5)
  })

  it('progress shows 2/9 after two scores', async () => {
    const user = userEvent.setup()
    renderPage()
    await currentCriterion('Încadrarea în temă')
    expect(screen.getByLabelText('0 of 9 criteria scored')).toBeInTheDocument()

    await user.keyboard('4{ArrowDown}2')

    expect(await screen.findByLabelText('2 of 9 criteria scored')).toHaveTextContent('2/9')
  })

  it('locked phase disables scoring buttons', async () => {
    renderPage({
      event: openEvent({ statusOverride: 'locked', lockedAt: '2026-11-10T19:00:00.000Z' }),
    })
    await currentCriterion('Încadrarea în temă')

    for (const value of ['1', '2.5', '5']) {
      expect(screen.getByRole('button', { name: value })).toBeDisabled()
    }
    expect(screen.getByText(/Scoring is locked/)).toBeInTheDocument()
  })

  it('locked phase keeps scoring enabled while taps are still waiting to sync', async () => {
    renderPage({
      event: openEvent({ statusOverride: 'locked', lockedAt: '2026-11-10T19:00:00.000Z' }),
      sync: { pending: 1, rejected: 0, online: false },
    })
    await currentCriterion('Încadrarea în temă')
    expect(screen.getByRole('button', { name: '3' })).toBeEnabled()
  })

  it('setup phase disables scoring buttons', async () => {
    renderPage({ event: openEvent({ startsAt: '2999-01-01T08:00:00.000Z' }) })
    await currentCriterion('Încadrarea în temă')
    expect(screen.getByRole('button', { name: '3' })).toBeDisabled()
    expect(screen.getByText(/Scoring opens/)).toBeInTheDocument()
  })

  it('a no-show team cannot be scored', async () => {
    renderPage({ teamId: 't3' })
    await currentCriterion('Încadrarea în temă')
    expect(screen.getByRole('button', { name: '3' })).toBeDisabled()
    expect(screen.getByText(/marked as a no-show/)).toBeInTheDocument()
  })

  it('marks a rejected score as not saved and explains why', async () => {
    const rejected: QueuedScore = {
      key: scoreKey('t1', 'c1'),
      jurorId: JUROR,
      eventId: 'ev-1',
      teamId: 't1',
      criterionId: 'c1',
      value: 4,
      tappedAt: '2026-11-10T10:00:00.000Z',
      status: 'rejected',
      reason: 'locked',
    }
    useScoreQueue.setState({ items: { [queueId(rejected)]: rejected } })
    renderPage({ sync: { pending: 0, rejected: 1, online: true } })
    await currentCriterion('Încadrarea în temă')

    const strip = screen.getByRole('navigation', { name: 'Criteria' })
    expect(within(strip).getByRole('button', { name: /^Criterion 1/ })).toHaveAccessibleName(
      /not saved/,
    )
    expect(
      screen.getAllByText(/Scoring is locked, so this score wasn't saved/).length,
    ).toBeGreaterThan(0)
    expect(screen.getByText('Not saved: 1')).toBeInTheDocument()
    // A rejected score doesn't count as scored.
    expect(screen.getByLabelText('0 of 9 criteria scored')).toBeInTheDocument()
  })

  it('shows the sync state from pending counts', async () => {
    renderPage({ sync: { pending: 2, rejected: 0, online: false } })
    expect(await screen.findByText('Offline: 2 waiting')).toBeInTheDocument()
  })

  it('never renders another juror’s queued score', async () => {
    const other: QueuedScore = {
      key: scoreKey('t1', 'c1'),
      jurorId: 'juror-2',
      eventId: 'ev-1',
      teamId: 't1',
      criterionId: 'c1',
      value: 2.5,
      tappedAt: '2026-11-10T10:00:00.000Z',
      status: 'pending',
    }
    useScoreQueue.setState({ items: { [queueId(other)]: other } })
    renderPage()
    await currentCriterion('Încadrarea în temă')
    const strip = screen.getByRole('navigation', { name: 'Criteria' })
    expect(within(strip).getByRole('button', { name: /^Criterion 1/ })).toHaveAccessibleName(
      /no score/,
    )
  })

  it('back link returns to the team list', async () => {
    const user = userEvent.setup()
    const router = renderPage()
    await user.click(await screen.findByRole('link', { name: 'All teams' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/score'))
  })
})
