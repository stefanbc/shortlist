import { describe, expect, it } from 'vitest'
import type { Criterion, Score } from '@/domain/types'
import type { TeamWithProject } from '@/features/teams/api'
import type { Profile } from '@/stores/session'
import { buildScoresCsv, guardFormulaInjection } from './csv'
import type { ExportData } from './types'

function team(overrides: Partial<TeamWithProject> & { id: string; name: string }): TeamWithProject {
  return {
    pitchOrder: 1,
    noShow: false,
    manualTiebreak: null,
    members: [],
    project: { name: null, description: null, themeId: null, repoUrl: null },
    ...overrides,
  }
}

function juror(id: string, displayName: string): Profile {
  return { id, displayName, email: null, role: 'juror', active: true }
}

function criterion(overrides: Partial<Criterion> & { id: string; name: string }): Criterion {
  return { weight: 10, position: 1, ...overrides }
}

function baseData(overrides: Partial<ExportData> = {}): ExportData {
  return {
    eventName: 'Astra Hack',
    themes: [],
    criteria: [],
    teams: [],
    themeNames: {},
    jurors: [],
    scores: [],
    ranked: [],
    ...overrides,
  }
}

describe('buildScoresCsv', () => {
  it('starts with a UTF-8 BOM', () => {
    const csv = buildScoresCsv(baseData())
    expect(csv.charCodeAt(0)).toBe(0xfeff)
  })

  it('has one data row per score, plus the header row', () => {
    const data = baseData({
      teams: [team({ id: 't1', name: 'Team One' })],
      criteria: [criterion({ id: 'c1', name: 'Crit One', weight: 20 })],
      jurors: [juror('j1', 'Ana Pop'), juror('j2', 'Ion Marin')],
      scores: [
        { teamId: 't1', criterionId: 'c1', jurorId: 'j1', value: 4 },
        { teamId: 't1', criterionId: 'c1', jurorId: 'j2', value: 3.5 },
      ] satisfies Score[],
    })

    const noBom = buildScoresCsv(data).slice(1) // drop the leading BOM
    const lines = noBom.trimEnd().split('\r\n')

    expect(lines).toHaveLength(3) // header + 2 scores
    expect(lines[0]).toBe('team,project,juror,criterion,weight,value')
    expect(lines[1]).toBe('Team One,,Ana Pop,Crit One,20,4')
    expect(lines[2]).toBe('Team One,,Ion Marin,Crit One,20,3.5')
  })

  it('quotes fields containing commas, quotes or newlines (RFC 4180)', () => {
    const data = baseData({
      teams: [team({ id: 't1', name: 'Team, "The Best"' })],
      criteria: [criterion({ id: 'c1', name: "Line one\nLine two", weight: 20 })],
      jurors: [juror('j1', 'Ana Pop')],
      scores: [{ teamId: 't1', criterionId: 'c1', jurorId: 'j1', value: 4 }],
    })

    const csv = buildScoresCsv(data)

    expect(csv).toContain('"Team, ""The Best"""')
    expect(csv).toContain('"Line one\nLine two"')
  })

  it('guards a formula-shaped juror name against CSV injection', () => {
    const data = baseData({
      teams: [team({ id: 't1', name: 'Team One' })],
      criteria: [criterion({ id: 'c1', name: 'Crit One', weight: 20 })],
      jurors: [juror('j1', '=HYPERLINK("evil.example")')],
      scores: [{ teamId: 't1', criterionId: 'c1', jurorId: 'j1', value: 4 }],
    })

    const csv = buildScoresCsv(data)

    // the value is quote-guarded (leading ') then RFC-4180-quoted because it also
    // contains a comma and quotes of its own
    expect(csv).toContain(`"'=HYPERLINK(""evil.example"")"`)
    // the raw (unguarded) formula-shaped text never appears as a bare, unguarded field
    expect(csv).not.toMatch(/,=HYPERLINK/)
  })
})

describe('guardFormulaInjection', () => {
  it.each(['=cmd', '+1', '-1', '@SUM(A1)', '\ttabbed', '\rcr'])(
    'prefixes %j with a single quote',
    (value) => {
      expect(guardFormulaInjection(value)).toBe(`'${value}`)
    },
  )

  it('leaves ordinary text untouched', () => {
    expect(guardFormulaInjection('Ana Pop')).toBe('Ana Pop')
  })
})
