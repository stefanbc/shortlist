import { describe, expect, it } from 'vitest'
import { computeTeamResult, rankTeams } from './scoring'
import type { Criterion, Score, Team } from './types'

function makeTeam(overrides: Partial<Team> & { id: Id }): Team {
  return {
    name: overrides.id,
    pitchOrder: 1,
    noShow: false,
    manualTiebreak: null,
    ...overrides,
  }
}

type Id = string

function criterion(id: Id, weight: number, position: number): Criterion {
  return { id, name: id, weight, position }
}

describe('computeTeamResult', () => {
  it('computes the sheet formula with blanks excluded', () => {
    const team = makeTeam({ id: 'team1' })
    const criteria = [criterion('A', 20, 1), criterion('B', 90, 2)]
    const scores: Score[] = [
      { teamId: 'team1', criterionId: 'A', jurorId: 'j1', value: 3 },
      { teamId: 'team1', criterionId: 'A', jurorId: 'j2', value: 2 },
      { teamId: 'team1', criterionId: 'A', jurorId: 'j3', value: 1.5 },
      { teamId: 'team1', criterionId: 'B', jurorId: 'j1', value: 4 },
      { teamId: 'team1', criterionId: 'B', jurorId: 'j2', value: 3 },
      // j3 left B blank
    ]

    const result = computeTeamResult(team, criteria, scores)

    const aAverage = 6.5 / 3
    const aWeighted = 20 * aAverage
    const bAverage = 3.5
    const bWeighted = 90 * bAverage
    const expectedFinal = (aWeighted + bWeighted) / 110

    const a = result.criteria.find((c) => c.criterionId === 'A')
    const b = result.criteria.find((c) => c.criterionId === 'B')

    expect(a?.average).toBeCloseTo(aAverage, 9)
    expect(a?.weighted).toBeCloseTo(aWeighted, 9)
    expect(a?.count).toBe(3)
    expect(b?.average).toBeCloseTo(bAverage, 9)
    expect(b?.weighted).toBeCloseTo(bWeighted, 9)
    expect(b?.count).toBe(2)
    expect(result.final).toBeCloseTo(expectedFinal, 9)
  })

  it('excludes criteria nobody scored from numerator and denominator', () => {
    const team = makeTeam({ id: 'team1' })
    const criteria = [criterion('A', 20, 1), criterion('B', 90, 2)]
    const scores: Score[] = [
      { teamId: 'team1', criterionId: 'A', jurorId: 'j1', value: 3 },
      { teamId: 'team1', criterionId: 'A', jurorId: 'j2', value: 2 },
      { teamId: 'team1', criterionId: 'A', jurorId: 'j3', value: 1.5 },
    ]

    const result = computeTeamResult(team, criteria, scores)
    const a = result.criteria.find((c) => c.criterionId === 'A')
    const b = result.criteria.find((c) => c.criterionId === 'B')

    expect(b?.average).toBeNull()
    expect(b?.weighted).toBeNull()
    expect(b?.count).toBe(0)
    expect(result.final).toBeCloseTo(a!.average as number, 9)
  })

  it('returns null final when no scores', () => {
    const team = makeTeam({ id: 'team1' })
    const criteria = [criterion('A', 20, 1), criterion('B', 90, 2)]

    const result = computeTeamResult(team, criteria, [])

    expect(result.final).toBeNull()
    expect(result.criteria.every((c) => c.average === null)).toBe(true)
  })

  it('returns null final when there are no criteria', () => {
    const team = makeTeam({ id: 'team1' })
    const scores: Score[] = [{ teamId: 'team1', criterionId: 'A', jurorId: 'j1', value: 3 }]

    const result = computeTeamResult(team, [], scores)

    expect(result.final).toBeNull()
    expect(result.criteria).toEqual([])
  })

  it('no-show scores exactly 1 regardless of scores', () => {
    const team = makeTeam({ id: 'team1', noShow: true })
    const criteria = [criterion('A', 20, 1), criterion('B', 90, 2)]
    const scores: Score[] = [
      { teamId: 'team1', criterionId: 'A', jurorId: 'j1', value: 5 },
      { teamId: 'team1', criterionId: 'B', jurorId: 'j1', value: 5 },
    ]

    const result = computeTeamResult(team, criteria, scores)

    expect(result.final).toBe(1)
    expect(result.criteria.every((c) => c.average === null)).toBe(true)
  })

  it('only considers scores matching the team id and criteria list', () => {
    const team = makeTeam({ id: 'team1' })
    const criteria = [criterion('A', 20, 1)]
    const scores: Score[] = [
      { teamId: 'team1', criterionId: 'A', jurorId: 'j1', value: 3 },
      { teamId: 'team2', criterionId: 'A', jurorId: 'j2', value: 5 }, // other team
      { teamId: 'team1', criterionId: 'Z', jurorId: 'j3', value: 1 }, // criterion not in list
    ]

    const result = computeTeamResult(team, criteria, scores)
    const a = result.criteria.find((c) => c.criterionId === 'A')

    expect(a?.average).toBeCloseTo(3, 9)
    expect(a?.count).toBe(1)
  })

  it('juror averages are plain averages across criteria (sheet row 11)', () => {
    const team = makeTeam({ id: 'team1' })
    const criteria = [criterion('A', 20, 1), criterion('B', 90, 2)]
    const scores: Score[] = [
      { teamId: 'team1', criterionId: 'A', jurorId: 'j1', value: 3 },
      { teamId: 'team1', criterionId: 'B', jurorId: 'j1', value: 5 },
      { teamId: 'team1', criterionId: 'A', jurorId: 'j2', value: 4 },
      // j2 left B blank
    ]

    const result = computeTeamResult(team, criteria, scores)
    const j1 = result.jurors.find((j) => j.jurorId === 'j1')
    const j2 = result.jurors.find((j) => j.jurorId === 'j2')

    expect(j1?.average).toBeCloseTo(4, 9) // (3 + 5) / 2
    expect(j2?.average).toBeCloseTo(4, 9) // just the one score
  })
})

describe('rankTeams', () => {
  it('ranks descending with null finals last and uses competition ranks', () => {
    const criteria = [criterion('c1', 10, 1)]
    const teams = [
      makeTeam({ id: 'A' }),
      makeTeam({ id: 'B' }),
      makeTeam({ id: 'C' }),
      makeTeam({ id: 'D' }),
    ]
    const scores: Score[] = [
      { teamId: 'A', criterionId: 'c1', jurorId: 'j1', value: 4 },
      { teamId: 'B', criterionId: 'c1', jurorId: 'j1', value: 3.5 },
      { teamId: 'C', criterionId: 'c1', jurorId: 'j1', value: 3.5 },
      // D has no scores at all
    ]

    const ranked = rankTeams(teams, criteria, scores)
    const byId = (id: string) => ranked.find((r) => r.teamId === id)!

    expect(byId('A').rank).toBe(1)
    expect(byId('B').rank).toBe(2)
    expect(byId('C').rank).toBe(2)
    expect(byId('D').rank).toBeNull()
    expect(byId('B').tiedWith).toEqual(['C'])
    expect(byId('C').tiedWith).toEqual(['B'])
    expect(byId('D').tiedWith).toEqual([])
  })

  it('breaks ties on highest-weight criterion average then the next', () => {
    const criteria = [criterion('c1', 100, 1), criterion('c2', 20, 2)]
    const teams = [makeTeam({ id: 'X' }), makeTeam({ id: 'Y' })]
    const scores: Score[] = [
      { teamId: 'X', criterionId: 'c1', jurorId: 'j1', value: 3.5 },
      { teamId: 'X', criterionId: 'c2', jurorId: 'j1', value: 2 },
      { teamId: 'Y', criterionId: 'c1', jurorId: 'j1', value: 3 },
      { teamId: 'Y', criterionId: 'c2', jurorId: 'j1', value: 4.5 },
    ]

    const ranked = rankTeams(teams, criteria, scores)
    const x = ranked.find((r) => r.teamId === 'X')!
    const y = ranked.find((r) => r.teamId === 'Y')!

    // Both finals are 3.25, but X scores higher on the weight-100 criterion.
    expect(x.final).toBeCloseTo(y.final as number, 9)
    expect(x.rank).toBe(1)
    expect(y.rank).toBe(2)
    expect(x.tieUnresolved).toBe(false)
    expect(y.tieUnresolved).toBe(false)
  })

  it('breaks ties by position ascending when criteria weights are equal', () => {
    const criteria = [criterion('c1', 50, 1), criterion('c2', 50, 2)]
    const teams = [makeTeam({ id: 'X' }), makeTeam({ id: 'Y' })]
    const scores: Score[] = [
      { teamId: 'X', criterionId: 'c1', jurorId: 'j1', value: 4 },
      { teamId: 'X', criterionId: 'c2', jurorId: 'j1', value: 2 },
      { teamId: 'Y', criterionId: 'c1', jurorId: 'j1', value: 3 },
      { teamId: 'Y', criterionId: 'c2', jurorId: 'j1', value: 3 },
    ]

    const ranked = rankTeams(teams, criteria, scores)
    const x = ranked.find((r) => r.teamId === 'X')!
    const y = ranked.find((r) => r.teamId === 'Y')!

    expect(x.final).toBeCloseTo(3, 9)
    expect(y.final).toBeCloseTo(3, 9)
    // c1 (position 1) decides it: X's c1 average (4) beats Y's (3).
    expect(x.rank).toBe(1)
    expect(y.rank).toBe(2)
  })

  it('flags a full tie in the top 3 as unresolved and shares the rank', () => {
    const criteria = [criterion('c1', 10, 1)]
    const teams = [makeTeam({ id: 'A' }), makeTeam({ id: 'B' }), makeTeam({ id: 'C' })]
    const scores: Score[] = [
      { teamId: 'A', criterionId: 'c1', jurorId: 'j1', value: 3 },
      { teamId: 'B', criterionId: 'c1', jurorId: 'j1', value: 3 },
      { teamId: 'C', criterionId: 'c1', jurorId: 'j1', value: 3 },
    ]

    const ranked = rankTeams(teams, criteria, scores)

    for (const r of ranked) {
      expect(r.rank).toBe(1)
      expect(r.tiedWith.sort()).toEqual(
        teams.map((t) => t.id).filter((id) => id !== r.teamId).sort(),
      )
      expect(r.tieUnresolved).toBe(true)
    }
  })

  it('resolves a full tie via manualTiebreak (lower first)', () => {
    const criteria = [criterion('c1', 10, 1)]
    const teams = [
      makeTeam({ id: 'A', manualTiebreak: 2 }),
      makeTeam({ id: 'B', manualTiebreak: 1 }),
      makeTeam({ id: 'C', manualTiebreak: 3 }),
    ]
    const scores: Score[] = [
      { teamId: 'A', criterionId: 'c1', jurorId: 'j1', value: 3 },
      { teamId: 'B', criterionId: 'c1', jurorId: 'j1', value: 3 },
      { teamId: 'C', criterionId: 'c1', jurorId: 'j1', value: 3 },
    ]

    const ranked = rankTeams(teams, criteria, scores)
    const byId = (id: string) => ranked.find((r) => r.teamId === id)!

    expect(byId('B').rank).toBe(1)
    expect(byId('A').rank).toBe(2)
    expect(byId('C').rank).toBe(3)
    for (const r of ranked) {
      expect(r.tiedWith).toEqual([])
      expect(r.tieUnresolved).toBe(false)
    }
  })

  it('sorts a team without manualTiebreak after ones that have it, within a full tie', () => {
    // Deferred issue from Task 2's review: a mixed state (only some tied teams have a
    // manual order) must still produce a total order, with "no order set" sorting last.
    const criteria = [criterion('c1', 10, 1)]
    const teams = [
      makeTeam({ id: 'A', manualTiebreak: 1 }),
      makeTeam({ id: 'B', manualTiebreak: null }),
      makeTeam({ id: 'C', manualTiebreak: 3 }),
    ]
    const scores: Score[] = [
      { teamId: 'A', criterionId: 'c1', jurorId: 'j1', value: 3 },
      { teamId: 'B', criterionId: 'c1', jurorId: 'j1', value: 3 },
      { teamId: 'C', criterionId: 'c1', jurorId: 'j1', value: 3 },
    ]

    const ranked = rankTeams(teams, criteria, scores)

    expect(ranked.map((r) => r.teamId)).toEqual(['A', 'C', 'B'])
  })

  it('shares the rank for a full tie outside the top 3 without flagging it', () => {
    const criteria = [criterion('c1', 10, 1)]
    const teams = [
      makeTeam({ id: 'A' }),
      makeTeam({ id: 'B' }),
      makeTeam({ id: 'C' }),
      makeTeam({ id: 'D' }),
      makeTeam({ id: 'E' }),
    ]
    const scores: Score[] = [
      { teamId: 'A', criterionId: 'c1', jurorId: 'j1', value: 5 },
      { teamId: 'B', criterionId: 'c1', jurorId: 'j1', value: 4 },
      { teamId: 'C', criterionId: 'c1', jurorId: 'j1', value: 3 },
      { teamId: 'D', criterionId: 'c1', jurorId: 'j1', value: 2 },
      { teamId: 'E', criterionId: 'c1', jurorId: 'j1', value: 2 },
    ]

    const ranked = rankTeams(teams, criteria, scores)
    const byId = (id: string) => ranked.find((r) => r.teamId === id)!

    expect(byId('A').rank).toBe(1)
    expect(byId('B').rank).toBe(2)
    expect(byId('C').rank).toBe(3)
    expect(byId('D').rank).toBe(4)
    expect(byId('E').rank).toBe(4)
    expect(byId('D').tiedWith).toEqual(['E'])
    expect(byId('D').tieUnresolved).toBe(false)
    expect(byId('E').tieUnresolved).toBe(false)
  })
})
