/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { rankTeams } from '@/domain/scoring'
import type { Criterion, Score, Team } from '@/domain/types'
import { parseWorkbook, toDomain } from '@/features/import/parseWorkbook'
import type { TeamWithProject } from '@/features/teams/api'
import type { Profile } from '@/stores/session'
import { buildWorkbook, jurorHeaderText } from './workbook'
import type { ExportData } from './types'

function jurorKeyFor(displayName: string): string {
  return displayName.replace(/\s+/g, ' ').trim().toLowerCase()
}

async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return blob.arrayBuffer()
}

function project(overrides: Partial<TeamWithProject['project']> = {}): TeamWithProject['project'] {
  return { name: null, description: null, themeId: null, repoUrl: null, ...overrides }
}

// A synthetic 2-team-scored + 1-no-show event, sized to the same shape as the real
// Astra Hack sheet (9 criteria, 6 jurors) -- see workbook.ts's comment on why the
// Scor/final cell's column and row matter for round-tripping through parseWorkbook,
// which reads the cached final from a fixed address.
const CRITERIA: Criterion[] = Array.from({ length: 9 }, (_, i) => ({
  id: `c${i + 1}`,
  name: `Criteriu ${i + 1}`,
  weight: 10 + i * 5,
  position: i + 1,
}))

const JUROR_NAMES = ['Ana Pop', 'Ion Marin', 'Mirela Groza', 'Radu Ionescu', 'Bianca Dan', 'Sorin Terchila']
const JURORS: Profile[] = JUROR_NAMES.map((displayName, i) => ({
  id: `j${i + 1}`,
  displayName,
  email: null,
  role: 'juror',
  active: true,
}))

function scoresFor(teamId: string): Score[] {
  const scores: Score[] = []
  CRITERIA.forEach((criterion, ci) => {
    JURORS.forEach((juror, ji) => {
      scores.push({
        teamId,
        criterionId: criterion.id,
        jurorId: juror.id,
        value: 1 + ((ci * 3 + ji * 7) % 9) * 0.5,
      })
    })
  })
  return scores
}

function buildSyntheticData(): ExportData {
  const teams: Team[] = [
    { id: 't1', name: 'Team One', pitchOrder: 1, noShow: false, manualTiebreak: null },
    { id: 't2', name: 'Team Two', pitchOrder: 2, noShow: false, manualTiebreak: null },
    { id: 't3', name: 'Team Three', pitchOrder: 3, noShow: true, manualTiebreak: null },
  ]
  const scores: Score[] = [...scoresFor('t1'), ...scoresFor('t2')]
  const ranked = rankTeams(teams, CRITERIA, scores)

  const teamsWithProject: TeamWithProject[] = [
    {
      ...teams[0],
      members: [],
      project: project({ name: 'Project One', description: 'Desc one', themeId: 'theme-1' }),
    },
    { ...teams[1], members: [], project: project({ name: 'Project Two', description: 'Desc two' }) },
    { ...teams[2], members: [], project: project() },
  ]

  return {
    eventName: 'Synthetic Hack',
    themes: ['Theme A'],
    criteria: CRITERIA,
    teams: teamsWithProject,
    themeNames: { 'theme-1': 'Theme A' },
    jurors: JURORS,
    scores,
    ranked,
  }
}

describe('jurorHeaderText', () => {
  it('splits "First Last" into "First\\nLAST"', () => {
    expect(jurorHeaderText('Mirela Groza')).toBe('Mirela\nGROZA')
  })

  it('upper-cases a single-word name whole, with no line break', () => {
    expect(jurorHeaderText('Ana')).toBe('ANA')
  })

  it('splits on the LAST space for a multi-part first name', () => {
    expect(jurorHeaderText('Ana Maria Pop')).toBe('Ana Maria\nPOP')
  })
})

describe('buildWorkbook (synthetic round-trip, always runs)', () => {
  it('parses back with the same scores (by team/criterion position/juror key) and expectedFinals', async () => {
    const data = buildSyntheticData()
    const blob = await buildWorkbook(data)
    const parsed = await parseWorkbook(await blobToArrayBuffer(blob))

    expect(parsed.teams).toHaveLength(3)
    expect(parsed.criteria).toHaveLength(9)

    for (const team of data.teams) {
      const sheetName = `E${team.pitchOrder}`
      const parsedTeam = parsed.teams.find((t) => t.sheet === sheetName)
      expect(parsedTeam, `expected a ${sheetName} sheet`).toBeDefined()

      const originalScores = data.scores.filter((s) => s.teamId === team.id)
      const expectedTuples = new Set(
        originalScores.map((s) => {
          const jurorName = data.jurors.find((j) => j.id === s.jurorId)!.displayName
          const criterionPosition = data.criteria.find((c) => c.id === s.criterionId)!.position
          return `${criterionPosition}:${jurorKeyFor(jurorName)}:${s.value}`
        }),
      )
      const actualTuples = new Set(
        parsedTeam!.scores.map((s) => `${s.criterionPosition}:${s.jurorKey}:${s.value}`),
      )
      expect(actualTuples).toEqual(expectedTuples)

      const entry = data.ranked.find((r) => r.teamId === team.id)!
      const expectedFinal = parsed.expectedFinals[sheetName]
      if (team.noShow) {
        expect(parsedTeam!.noShow).toBe(true)
        expect(parsedTeam!.scores).toEqual([])
        expect(expectedFinal).toBeNull()
      } else {
        expect(parsedTeam!.noShow).toBe(false)
        expect(expectedFinal).not.toBeNull()
        expect(expectedFinal as number).toBeCloseTo(entry.final as number, 9)
      }
    }

    // PARITY: our own domain re-computation from the parsed-back data agrees with the
    // cached finals we just asserted above -- i.e. the round trip is faithful end to end.
    const { criteria, teams, scores } = toDomain(parsed)
    const recomputed = rankTeams(teams, criteria, scores)
    for (const team of data.teams) {
      const before = data.ranked.find((r) => r.teamId === team.id)!
      const after = recomputed.find((r) => r.teamId === `E${team.pitchOrder}`)!
      if (before.final === null) {
        expect(after.final).toBeNull()
      } else {
        expect(after.final).toBeCloseTo(before.final, 9)
      }
    }
  })
})

describe('buildWorkbook formula-injection guard', () => {
  it('stores a formula-shaped team name as literal text, not a live formula', async () => {
    const data = buildSyntheticData()
    data.teams[0] = { ...data.teams[0], name: '=HYPERLINK("https://evil.example","click")' }

    const blob = await buildWorkbook(data)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await blobToArrayBuffer(blob))
    const sheet = workbook.getWorksheet('E1')!
    const cellValue = sheet.getCell(13, 2).value // B13: Echipa name

    expect(typeof cellValue).toBe('string')
    expect(cellValue).toBe(`'=HYPERLINK("https://evil.example","click")`)
  })
})

// Private fixture: see parseWorkbook.test.ts for why this is git-ignored and skipped
// when absent (Ruling R1).
const FIXTURE = path.resolve(import.meta.dirname, '../../../fixtures/astra-hack.xlsx')
const FIXTURE_EXISTS = existsSync(FIXTURE)

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

describe.skipIf(!FIXTURE_EXISTS)('buildWorkbook (astra-hack.xlsx fixture round-trip)', () => {
  it('re-exports the real event and parses back with matching scores and finals', async () => {
    const original = await parseWorkbook(toArrayBuffer(readFileSync(FIXTURE)))
    const { criteria, teams, scores } = toDomain(original)
    const ranked = rankTeams(teams, criteria, scores)

    const themeIds = new Map(original.themes.map((name) => [name, name]))
    const teamsWithProject: TeamWithProject[] = original.teams.map((parsedTeam, index) => ({
      id: teams[index].id,
      name: parsedTeam.name,
      pitchOrder: parsedTeam.pitchOrder,
      noShow: parsedTeam.noShow,
      manualTiebreak: null,
      members: [],
      project: {
        name: parsedTeam.projectName,
        description: parsedTeam.description,
        themeId: parsedTeam.theme ? (themeIds.get(parsedTeam.theme) ?? null) : null,
        repoUrl: parsedTeam.repoUrl,
      },
    }))

    const data: ExportData = {
      eventName: 'Astra Hack',
      themes: original.themes,
      criteria,
      teams: teamsWithProject,
      themeNames: Object.fromEntries(original.themes.map((name) => [name, name])),
      jurors: original.jurors.map((j) => ({
        id: j.key,
        displayName: j.displayName,
        email: null,
        role: 'juror',
        active: true,
      })),
      scores,
      ranked,
    }

    const blob = await buildWorkbook(data)
    const reparsed = await parseWorkbook(await blobToArrayBuffer(blob))

    expect(reparsed.teams).toHaveLength(original.teams.length)

    for (const parsedTeam of original.teams) {
      const reexported = reparsed.teams.find((t) => t.sheet === parsedTeam.sheet)!
      expect(reexported.noShow).toBe(parsedTeam.noShow)

      const originalTuples = new Set(
        parsedTeam.scores.map((s) => `${s.criterionPosition}:${s.jurorKey}:${s.value}`),
      )
      const reexportedTuples = new Set(
        reexported.scores.map((s) => `${s.criterionPosition}:${s.jurorKey}:${s.value}`),
      )
      expect(reexportedTuples).toEqual(originalTuples)

      const originalFinal = original.expectedFinals[parsedTeam.sheet]
      const reexportedFinal = reparsed.expectedFinals[parsedTeam.sheet]
      if (originalFinal === null) {
        expect(reexportedFinal).toBeNull()
      } else {
        expect(reexportedFinal).toBeCloseTo(originalFinal as number, 6)
      }
    }
  })
})
