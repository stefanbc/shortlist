/// <reference types="node" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { criterionStats, jurorStats } from '@/domain/analytics'
import { rankTeams } from '@/domain/scoring'
import type { Criterion, Score, Team } from '@/domain/types'
import { parseWorkbook, toDomain } from '@/features/import/parseWorkbook'
import type { TeamWithProject } from '@/features/teams/api'
import type { Profile } from '@/stores/session'
import { CriteriaReportView } from './CriteriaReportPage'
import { JurorReportView } from './JurorReportPage'
import { PodiumView } from './PodiumPage'
import { RankingView } from './RankingPage'
import { TeamBreakdownView } from './TeamBreakdownPage'

// Private fixture: see parseWorkbook.test.ts. Git-ignored, never committed; tests that
// need it skip cleanly when it's absent (Ruling R1).
const FIXTURE = path.resolve(import.meta.dirname, '../../../fixtures/astra-hack.xlsx')
const FIXTURE_EXISTS = existsSync(FIXTURE)

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

/** Minimal `TeamWithProject` wrapper for a bare domain `Team` -- the report views only
 * read a handful of project fields, so tests don't need a real import pipeline for them. */
function withProject(team: Team, project: Partial<TeamWithProject['project']> = {}): TeamWithProject {
  return {
    ...team,
    members: [],
    project: { name: null, description: null, themeId: null, repoUrl: null, ...project },
  }
}

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe.skipIf(!FIXTURE_EXISTS)('reports (astra-hack.xlsx fixture)', () => {
  const data = FIXTURE_EXISTS
    ? toArrayBuffer(readFileSync(FIXTURE))
    : (undefined as unknown as ArrayBuffer)

  // Expectations are derived from the fixture itself (never hard-coded names or numbers:
  // the fixture's contents are private and this repo is public).
  async function fixtureResults() {
    const parsed = await parseWorkbook(data)
    const { criteria, teams, scores } = toDomain(parsed)
    const ranked = rankTeams(teams, criteria, scores)
    const nameOf = (teamId: string) => teams.find((team) => team.id === teamId)!.name
    return { parsed, criteria, teams, scores, ranked, nameOf }
  }

  it('podium shows the three top-ranked teams', async () => {
    const { teams, ranked, nameOf } = await fixtureResults()

    render(<PodiumView eventId="ev-1" ranked={ranked} teams={teams.map((team) => withProject(team))} />)

    for (const entry of ranked.slice(0, 3)) {
      expect(screen.getByText(nameOf(entry.teamId))).toBeInTheDocument()
    }
  })

  it('ranking shows the no-show team last, with its badge', async () => {
    const { teams, ranked } = await fixtureResults()
    const noShows = teams.filter((team) => team.noShow)
    expect(noShows).toHaveLength(1)

    renderWithRouter(
      <RankingView
        eventId="ev-1"
        ranked={ranked}
        teams={teams.map((team) => withProject(team))}
        themeNames={new Map()}
      />,
    )

    const rows = screen.getAllByRole('row')
    const lastRow = rows[rows.length - 1]
    expect(within(lastRow).getByText(noShows[0].name)).toBeInTheDocument()
    expect(within(lastRow).getByText(t('teams.noShowBadge'))).toBeInTheDocument()
  })

  it("team breakdown shows a team's final, matching the sheet's cached value", async () => {
    const { parsed, criteria, scores, teams, ranked } = await fixtureResults()
    const team = teams.find((candidate) => candidate.id === 'E1')!
    const entry = ranked.find((r) => r.teamId === team.id)
    const cachedFinal = parsed.expectedFinals['E1'] as number

    render(
      <TeamBreakdownView
        team={withProject(team)}
        entry={entry}
        criteria={criteria}
        scores={scores}
        assignedJurors={[]}
        allProfiles={[]}
        themeName={null}
      />,
    )

    // The final appears both in the summary card and the grid's footer row.
    expect(screen.getAllByText(cachedFinal.toFixed(3)).length).toBeGreaterThan(0)
  })
})

// --- Synthetic equivalents: small hand-built data, so these always run in CI, with or
// --- without the private fixture (the three above mirror the brief's acceptance cases;
// --- these also cover the criteria and juror analysis views the brief doesn't name).

function t(key: string): string {
  // Avoids pulling in react-i18next's hook form in a plain helper; the app only ships
  // English/Romanian and these tests run with the default (English) language.
  const en: Record<string, string> = {
    'teams.noShowBadge': 'No-show',
  }
  return en[key]
}

function criterion(id: string, weight: number, position: number): Criterion {
  return { id, name: `Criterion ${id}`, weight, position }
}

function team(id: string, overrides: Partial<Team> = {}): Team {
  return { id, name: id, pitchOrder: 1, noShow: false, manualTiebreak: null, ...overrides }
}

function score(teamId: string, criterionId: string, jurorId: string, value: number): Score {
  return { teamId, criterionId, jurorId, value }
}

const JUROR_ANA: Profile = { id: 'j-ana', displayName: 'Ana', email: null, role: 'juror', active: true }
const JUROR_BOGDAN: Profile = {
  id: 'j-bogdan',
  displayName: 'Bogdan',
  email: null,
  role: 'juror',
  active: true,
}

describe('PodiumView (synthetic)', () => {
  const criteria = [criterion('c1', 10, 1)]
  const teams = [team('gold', { name: 'Gold Team' }), team('silver', { name: 'Silver Team' }), team('bronze', { name: 'Bronze Team' }), team('fourth', { name: 'Fourth Team' })]
  const scores = [
    score('gold', 'c1', 'j1', 5),
    score('silver', 'c1', 'j1', 4),
    score('bronze', 'c1', 'j1', 3),
    score('fourth', 'c1', 'j1', 2),
  ]
  const ranked = rankTeams(teams, criteria, scores)

  it('shows the top 3 team names, and fourth place below the podium', () => {
    render(<PodiumView eventId="ev-1" ranked={ranked} teams={teams.map((tm) => withProject(tm))} />)

    expect(screen.getByText('Gold Team')).toBeInTheDocument()
    expect(screen.getByText('Silver Team')).toBeInTheDocument()
    expect(screen.getByText('Bronze Team')).toBeInTheDocument()
    // Fourth place is not on the podium; it is listed under it, among the runners-up.
    const runnersUp = screen.getByRole('list')
    expect(within(runnersUp).getByText('Fourth Team')).toBeInTheDocument()
    expect(within(runnersUp).queryByText('Gold Team')).not.toBeInTheDocument()
  })

  it('warns about an unresolved top-3 tie and lets the organizer resolve it', async () => {
    const user = userEvent.setup()
    const tiedScores = [
      score('gold', 'c1', 'j1', 5),
      score('silver', 'c1', 'j1', 4),
      score('bronze', 'c1', 'j1', 4),
      score('fourth', 'c1', 'j1', 2),
    ]
    const tiedRanked = rankTeams(teams, criteria, tiedScores)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <PodiumView eventId="ev-1" ranked={tiedRanked} teams={teams.map((tm) => withProject(tm))} />
      </QueryClientProvider>,
    )

    expect(screen.getByText(/tied for place/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /resolve tie/i }))
    expect(screen.getByText(/set the order for this tie/i)).toBeInTheDocument()
  })

  it('shows an empty state when nothing has a final score yet', () => {
    render(<PodiumView eventId="ev-1" ranked={[]} teams={[]} />)
    expect(screen.getByText(/not enough scores yet/i)).toBeInTheDocument()
  })
})

describe('RankingView (synthetic)', () => {
  const criteria = [criterion('c1', 10, 1)]
  const teams = [
    team('alpha', { name: 'Alpha' }),
    team('beta', { name: 'Beta' }),
    team('ghost', { name: 'Ghost Team', noShow: true }),
  ]
  const scores = [score('alpha', 'c1', 'j1', 5), score('beta', 'c1', 'j1', 3)]
  const ranked = rankTeams(teams, criteria, scores)

  it('shows the no-show team last with a no-show badge', () => {
    renderWithRouter(
      <RankingView
        eventId="ev-1"
        ranked={ranked}
        teams={teams.map((tm) => withProject(tm))}
        themeNames={new Map()}
      />,
    )

    const rows = screen.getAllByRole('row')
    const lastRow = rows[rows.length - 1]
    expect(within(lastRow).getByText('Ghost Team')).toBeInTheDocument()
    expect(within(lastRow).getByText(t('teams.noShowBadge'))).toBeInTheDocument()
  })
})

describe('TeamBreakdownView (synthetic)', () => {
  const criteria = [criterion('c1', 20, 1), criterion('c2', 90, 2)]
  const scores = [
    score('t1', 'c1', 'j-ana', 4),
    score('t1', 'c1', 'j-bogdan', 2),
    score('t1', 'c2', 'j-ana', 5),
    score('t1', 'c2', 'j-removed', 3), // a juror no longer assigned, but still counted
  ]
  const t1 = team('t1', { name: 'Team One' })
  const ranked = rankTeams([t1], criteria, scores)
  const entry = ranked.find((r) => r.teamId === 't1')

  it('shows the expected final score and every scoring juror, including a removed one', () => {
    render(
      <TeamBreakdownView
        team={withProject(t1)}
        entry={entry}
        criteria={criteria}
        scores={scores}
        assignedJurors={[JUROR_ANA]}
        allProfiles={[JUROR_ANA, JUROR_BOGDAN]}
        themeName={null}
      />,
    )

    // c1 average = (4+2)/2 = 3, weighted = 60; c2 average = (5+3)/2 = 4, weighted = 360.
    // final = (60 + 360) / 110 = 3.818... (shown in both the summary card and the footer row)
    expect(screen.getAllByText('3.818').length).toBeGreaterThan(0)
    // j-ana is currently assigned; j-bogdan scored this team but was later removed from
    // the event -- their name still resolves via the profiles lookup.
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('Bogdan')).toBeInTheDocument()
    // j-removed has no profile at all: falls back to the "former juror" label.
    expect(screen.getByText('Former juror')).toBeInTheDocument()
  })

  it('shows a no-show notice instead of the grid for a no-show team', () => {
    const noShowTeam = team('ghost', { name: 'Ghost', noShow: true })
    const noShowRanked = rankTeams([noShowTeam], criteria, [])
    render(
      <TeamBreakdownView
        team={withProject(noShowTeam)}
        entry={noShowRanked[0]}
        criteria={criteria}
        scores={[]}
        assignedJurors={[]}
        allProfiles={[]}
        themeName={null}
      />,
    )

    expect(screen.getByText(/this team was a no-show/i)).toBeInTheDocument()
    expect(screen.getByText('1.000')).toBeInTheDocument()
  })
})

describe('CriteriaReportView (synthetic)', () => {
  it('lists each criterion with its mean and spread', () => {
    const criteria = [criterion('c1', 10, 1), criterion('c2', 10, 2)]
    const scores = [
      score('t1', 'c1', 'j1', 5),
      score('t2', 'c1', 'j1', 1),
      score('t1', 'c2', 'j1', 3),
      score('t2', 'c2', 'j1', 3),
    ]
    const stats = criterionStats(criteria, scores)

    render(<CriteriaReportView criteria={criteria} stats={stats} />)

    // Each name may also appear as a chart axis label, so allow more than one match.
    expect(screen.getAllByText('Criterion c1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Criterion c2').length).toBeGreaterThan(0)
    // c1 has the wider spread between teams -- criterionStats sorts it first.
    const rows = screen.getAllByRole('row')
    expect(within(rows[1]).getByText('Criterion c1')).toBeInTheDocument()
  })

  it('shows an empty state with no scores yet', () => {
    render(<CriteriaReportView criteria={[criterion('c1', 10, 1)]} stats={[]} />)
    expect(screen.getByText(/no scores yet/i)).toBeInTheDocument()
  })

  it('shows an empty state when criteria are configured but nobody has scored yet', () => {
    // criterionStats() always returns one entry per criterion (mean/spread null until
    // scored) -- it's never actually [] once criteria exist, so the empty state must key
    // off "every stat has a null mean", not "stats.length === 0".
    const criteria = [criterion('c1', 10, 1), criterion('c2', 10, 2)]
    const stats = criterionStats(criteria, [])

    render(<CriteriaReportView criteria={criteria} stats={stats} />)

    expect(screen.getByText(/no scores yet/i)).toBeInTheDocument()
  })
})

describe('JurorReportView (synthetic)', () => {
  it('flags an outlier score and resolves juror names, including a former juror', () => {
    const teams = [team('t1', { name: 'Team One' })]
    const scores = [
      score('t1', 'c1', 'j-ana', 5),
      score('t1', 'c1', 'j-bogdan', 2),
      score('t1', 'c1', 'j-unknown', 2.5), // not in assignedJurors or allProfiles
    ]
    const stats = jurorStats(scores)

    render(
      <JurorReportView
        stats={stats}
        assignedJurors={[JUROR_ANA]}
        allProfiles={[JUROR_ANA, JUROR_BOGDAN]}
        teams={teams.map((tm) => withProject(tm))}
        criteria={[criterion('c1', 10, 1)]}
      />,
    )

    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('Bogdan')).toBeInTheDocument()
    expect(screen.getByText('Former juror')).toBeInTheDocument()
    // Both Ana and the unknown juror scored an outlier on Team One.
    expect(screen.getAllByText(/Team One/).length).toBe(2)
  })

  it('shows an empty state with no scores yet', () => {
    render(
      <JurorReportView stats={[]} assignedJurors={[]} allProfiles={[]} teams={[]} criteria={[]} />,
    )
    expect(screen.getByText(/no scores yet/i)).toBeInTheDocument()
  })
})
