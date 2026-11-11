import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSetNowPitching, type EventRow } from '@/features/events/api'
import type { TeamWithProject } from '@/features/teams/api'
import { NowPitchingCard } from './DashboardPage'
import { chooseOption } from '@/test/select'

vi.mock('@/features/events/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/events/api')>()
  return { ...actual, useSetNowPitching: vi.fn() }
})

function team(id: string, name: string): TeamWithProject {
  return {
    id,
    name,
    members: [],
    pitchOrder: 1,
    noShow: false,
    manualTiebreak: null,
    project: { name: null, description: null, themeId: null, repoUrl: null },
  }
}

const TEAMS = [team('t1', 'Team One'), team('t2', 'Team Two')]

const EVENT: EventRow = {
  id: 'ev-1',
  name: 'Astra Hack',
  startsAt: '2099-01-01T09:00:00.000Z',
  endsAt: '2099-01-01T18:00:00.000Z',
  statusOverride: 'open',
  lockedAt: null,
  pitchMinutes: 7,
  nowPitchingTeamId: null,
  nowPitchingSince: null,
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('NowPitchingCard', () => {
  it('disables "clear" when nobody is on stage', () => {
    vi.mocked(useSetNowPitching).mockReturnValue({ mutateAsync: vi.fn() } as never)

    render(<NowPitchingCard event={EVENT} teams={TEAMS} />)

    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled()
  })

  it('disables "next" when the last team is on stage', () => {
    vi.mocked(useSetNowPitching).mockReturnValue({ mutateAsync: vi.fn() } as never)

    render(<NowPitchingCard event={{ ...EVENT, nowPitchingTeamId: 't2' }} teams={TEAMS} />)

    expect(screen.getByRole('button', { name: 'Next team' })).toBeDisabled()
  })

  it('enables both controls when a non-last team is on stage', () => {
    vi.mocked(useSetNowPitching).mockReturnValue({ mutateAsync: vi.fn() } as never)

    render(<NowPitchingCard event={{ ...EVENT, nowPitchingTeamId: 't1' }} teams={TEAMS} />)

    expect(screen.getByRole('button', { name: 'Next team' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Clear' })).toBeEnabled()
  })

  it('picking a team from the select calls setNowPitching with that team', async () => {
    const user = userEvent.setup()
    const mutateAsync = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useSetNowPitching).mockReturnValue({ mutateAsync } as never)

    render(<NowPitchingCard event={EVENT} teams={TEAMS} />)
    await chooseOption(user, screen.getByLabelText('Team on stage'), 'Team Two')

    expect(mutateAsync).toHaveBeenCalledWith({ eventId: 'ev-1', teamId: 't2' })
  })
})
