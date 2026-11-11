import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Criterion, Score } from '@/domain/types'
import type { TeamWithProject } from '@/features/teams/api'
import type { Profile } from '@/stores/session'
import { ProgressBoard } from './ProgressBoard'

const CRITERIA: Criterion[] = Array.from({ length: 9 }, (_, i) => ({
  id: `c${i + 1}`,
  name: `Criterion ${i + 1}`,
  weight: 10,
  position: i + 1,
}))

function team(id: string, name: string, noShow = false): TeamWithProject {
  return {
    id,
    name,
    members: [],
    pitchOrder: 1,
    noShow,
    manualTiebreak: null,
    project: { name: null, description: null, themeId: null, repoUrl: null },
  }
}

const JUROR: Profile = { id: 'j1', displayName: 'Ana', email: null, role: 'juror', active: true }

function scoresFor(teamId: string, jurorId: string, count: number): Score[] {
  return CRITERIA.slice(0, count).map((criterion) => ({
    teamId,
    criterionId: criterion.id,
    jurorId,
    value: 4,
  }))
}

describe('ProgressBoard', () => {
  it('shows 9/9 complete and 4/9 partial', () => {
    const teams = [team('t1', 'Team Complete'), team('t2', 'Team Partial')]
    const scores = [...scoresFor('t1', JUROR.id, 9), ...scoresFor('t2', JUROR.id, 4)]

    render(<ProgressBoard teams={teams} criteria={CRITERIA} jurors={[JUROR]} scores={scores} />)

    expect(screen.getByText('9/9')).toBeInTheDocument()
    expect(screen.getByText('4/9')).toBeInTheDocument()
  })

  it('shows 0/9 for a team the juror hasn’t started', () => {
    const teams = [team('t1', 'Team Untouched')]
    render(<ProgressBoard teams={teams} criteria={CRITERIA} jurors={[JUROR]} scores={[]} />)

    expect(screen.getByText('0/9')).toBeInTheDocument()
  })

  it('greys out a no-show team instead of counting its scores', () => {
    const teams = [team('t1', 'No Show Team', true)]
    render(
      <ProgressBoard
        teams={teams}
        criteria={CRITERIA}
        jurors={[JUROR]}
        scores={scoresFor('t1', JUROR.id, 9)}
      />,
    )

    expect(screen.queryByText('9/9')).not.toBeInTheDocument()
  })

  it('notes scores from jurors no longer assigned, without adding a row for them', () => {
    const teams = [team('t1', 'Team One')]
    const scores = [...scoresFor('t1', JUROR.id, 3), ...scoresFor('t1', 'j-former', 5)]

    render(<ProgressBoard teams={teams} criteria={CRITERIA} jurors={[JUROR]} scores={scores} />)

    expect(screen.queryByText('Ana')).toBeInTheDocument()
    expect(screen.queryAllByRole('row')).toHaveLength(2) // header row + Ana's row only
    expect(screen.getByText(/no longer on this event's jury/i)).toBeInTheDocument()
  })
})
