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

describe('buildWorkbook (former juror still scored a team)', () => {
  // Mirrors the real event's history: a juror (Mirela) scored the early teams, then was
  // replaced by a different juror (Ovidia) for the rest -- Mirela is no longer assigned
  // to the event (absent from `results.jurors`/`data.jurors`' "currently assigned" part),
  // but her scores on the teams she judged still count, and `buildExportData` resolves
  // her name from `allProfiles` (see types.test.ts). Every sheet still has exactly 6
  // juror columns (just a different 6 for team one), so this does not touch the
  // Scor-column-position concern the "different shape" tests below cover.
  const CURRENT_JUROR_NAMES = ['Ana Pop', 'Ion Marin', 'Bianca Dan', 'Radu Ionescu', 'Sorin Terchila', 'Ovidia Caba']
  const CURRENT_JURORS: Profile[] = CURRENT_JUROR_NAMES.map((displayName, i) => ({
    id: `cj${i + 1}`,
    displayName,
    email: null,
    role: 'juror',
    active: true,
  }))
  const FORMER_JUROR: Profile = {
    id: 'former-mirela',
    displayName: 'Mirela Groza',
    email: null,
    role: 'juror',
    active: true,
  }

  function scoresForTeam(teamId: string, jurors: Profile[]): Score[] {
    const scores: Score[] = []
    CRITERIA.forEach((criterion, ci) => {
      jurors.forEach((juror, ji) => {
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

  function buildFormerJurorData(): ExportData {
    const teams: Team[] = [
      { id: 't1', name: 'Early Team', pitchOrder: 1, noShow: false, manualTiebreak: null },
      { id: 't2', name: 'Later Team', pitchOrder: 2, noShow: false, manualTiebreak: null },
    ]
    // t1 was judged before the swap: 5 current jurors + the former juror (not juror 6).
    const t1Jurors = [...CURRENT_JURORS.slice(0, 5), FORMER_JUROR]
    // t2 was judged after the swap: all 6 current jurors, no former juror at all.
    const t2Jurors = CURRENT_JURORS
    const scores = [...scoresForTeam('t1', t1Jurors), ...scoresForTeam('t2', t2Jurors)]
    const ranked = rankTeams(teams, CRITERIA, scores)

    const teamsWithProject: TeamWithProject[] = teams.map((team) => ({
      ...team,
      members: [],
      project: project(),
    }))

    return {
      eventName: 'Synthetic Hack (juror swap)',
      themes: [],
      criteria: CRITERIA,
      teams: teamsWithProject,
      themeNames: {},
      // Only the 6 CURRENTLY assigned jurors -- `buildExportData` is what adds the
      // former juror in production; here we build `ExportData` directly, the way the
      // real `buildWorkbook` consumer would receive it, with the former juror already
      // resolved and appended (see `types.test.ts` for `buildExportData` itself).
      jurors: [...CURRENT_JURORS, FORMER_JUROR],
      scores,
      ranked,
    }
  }

  it("includes the former juror's column on the team they scored, and their scores round-trip", async () => {
    const data = buildFormerJurorData()
    const blob = await buildWorkbook(data)

    // The exported sheet has a header cell for the former juror.
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await blobToArrayBuffer(blob))
    const t1Sheet = workbook.getWorksheet('E1')!
    const headerTexts = [4, 5, 6, 7, 8, 9].map((col) => t1Sheet.getCell(1, col).value)
    expect(headerTexts).toContain(jurorHeaderText('Mirela Groza'))

    // Her scores round-trip through parseWorkbook under her normalized juror key.
    const parsed = await parseWorkbook(await blobToArrayBuffer(blob))
    const parsedT1 = parsed.teams.find((t) => t.sheet === 'E1')!
    const formerKey = jurorKeyFor('Mirela Groza')
    const formerScores = data.scores.filter((s) => s.teamId === 't1' && s.jurorId === 'former-mirela')
    const expectedTuples = new Set(
      formerScores.map((s) => {
        const position = data.criteria.find((c) => c.id === s.criterionId)!.position
        return `${position}:${formerKey}:${s.value}`
      }),
    )
    const actualTuples = new Set(
      parsedT1.scores.filter((s) => s.jurorKey === formerKey).map((s) => `${s.criterionPosition}:${s.jurorKey}:${s.value}`),
    )
    expect(actualTuples).toEqual(expectedTuples)
    expect(actualTuples.size).toBe(CRITERIA.length)

    // The juror who replaced her never scored this team.
    const currentSixthKey = jurorKeyFor('Ovidia Caba')
    expect(parsedT1.scores.some((s) => s.jurorKey === currentSixthKey)).toBe(false)

    // Both teams' finals round-trip correctly.
    for (const team of data.teams) {
      const sheetName = `E${team.pitchOrder}`
      const entry = data.ranked.find((r) => r.teamId === team.id)!
      const expectedFinal = parsed.expectedFinals[sheetName]
      expect(expectedFinal).not.toBeNull()
      expect(expectedFinal as number).toBeCloseTo(entry.final as number, 9)
    }
  })
})

describe('buildWorkbook (a shape different from Astra Hack\'s 9 criteria / 6 jurors)', () => {
  // Ruling R17: parseWorkbook must locate the cached final dynamically (the "Scor"
  // header's column, on the row right after the last criterion row) rather than the
  // literal cell J11 -- which is only correct by coincidence for a 9-criteria/6-juror
  // sheet. This shape (3 criteria, 2 jurors) puts the final at F5, nowhere near J11, so
  // it fails loudly if that dynamic lookup regresses.
  const SMALL_CRITERIA: Criterion[] = [
    { id: 'sc1', name: 'Small Criterion 1', weight: 10, position: 1 },
    { id: 'sc2', name: 'Small Criterion 2', weight: 20, position: 2 },
    { id: 'sc3', name: 'Small Criterion 3', weight: 30, position: 3 },
  ]
  const SMALL_JURORS: Profile[] = [
    { id: 'sj1', displayName: 'Ana Pop', email: null, role: 'juror', active: true },
    { id: 'sj2', displayName: 'Ion Marin', email: null, role: 'juror', active: true },
  ]

  function buildSmallShapeData(): ExportData {
    const teams: Team[] = [{ id: 't1', name: 'Only Team', pitchOrder: 5, noShow: false, manualTiebreak: null }]
    const scores: Score[] = []
    SMALL_CRITERIA.forEach((criterion, ci) => {
      SMALL_JURORS.forEach((juror, ji) => {
        scores.push({ teamId: 't1', criterionId: criterion.id, jurorId: juror.id, value: 2 + ci * 0.5 + ji })
      })
    })
    const ranked = rankTeams(teams, SMALL_CRITERIA, scores)

    return {
      eventName: 'Small Shape Hack',
      themes: [],
      criteria: SMALL_CRITERIA,
      teams: teams.map((team) => ({ ...team, members: [], project: project() })),
      themeNames: {},
      jurors: SMALL_JURORS,
      scores,
      ranked,
    }
  }

  it('the export -> parse round trip gives the correct expectedFinal, not null', async () => {
    const data = buildSmallShapeData()
    const blob = await buildWorkbook(data)

    // Sanity-check where the final actually landed: column F (4 + 2 jurors), row 5
    // (2 + 3 criteria) -- nowhere near J11.
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await blobToArrayBuffer(blob))
    const sheet = workbook.getWorksheet('E5')!
    const finalCellValue = sheet.getCell('F5').value as { result?: number } | null
    expect(finalCellValue).not.toBeNull()
    expect(typeof finalCellValue).toBe('object')

    const parsed = await parseWorkbook(await blobToArrayBuffer(blob))
    const entry = data.ranked.find((r) => r.teamId === 't1')!
    expect(parsed.expectedFinals['E5']).not.toBeNull()
    expect(parsed.expectedFinals['E5'] as number).toBeCloseTo(entry.final as number, 9)
  })
})

describe('buildWorkbook (more criteria than the Astra layout has room for)', () => {
  // Astra's metadata block starts at B12, right under a 9-criteria grid (rows 2-10, the
  // averages on row 11). With 12 criteria the grid runs to row 13 and the averages to row
  // 14, so the block has to move down below it instead of overwriting criterion names.
  const MANY_CRITERIA: Criterion[] = Array.from({ length: 12 }, (_, i) => ({
    id: `mc${i + 1}`,
    name: `Many Criterion ${i + 1}`,
    weight: 5 + i,
    position: i + 1,
  }))
  const TWO_JURORS: Profile[] = [
    { id: 'mj1', displayName: 'Ana Pop', email: null, role: 'juror', active: true },
    { id: 'mj2', displayName: 'Ion Marin', email: null, role: 'juror', active: true },
  ]

  function buildManyCriteriaData(): ExportData {
    const teams: Team[] = [{ id: 't1', name: 'Wide Team', pitchOrder: 1, noShow: false, manualTiebreak: null }]
    const scores: Score[] = []
    MANY_CRITERIA.forEach((criterion, ci) => {
      TWO_JURORS.forEach((juror, ji) => {
        scores.push({ teamId: 't1', criterionId: criterion.id, jurorId: juror.id, value: 1 + ((ci + ji) % 9) * 0.5 })
      })
    })
    return {
      eventName: 'Wide Hack',
      themes: ['Theme W'],
      criteria: MANY_CRITERIA,
      teams: teams.map((team) => ({
        ...team,
        members: [],
        project: project({ name: 'Wide Project', themeId: 'tw', repoUrl: 'https://example.test/wide' }),
      })),
      themeNames: { tw: 'Theme W' },
      jurors: TWO_JURORS,
      scores,
      ranked: rankTeams(teams, MANY_CRITERIA, scores),
    }
  }

  it('round-trips 12 criteria, every score, the final and the team metadata', async () => {
    const data = buildManyCriteriaData()
    const parsed = await parseWorkbook(await blobToArrayBuffer(await buildWorkbook(data)))

    expect(parsed.criteria).toEqual(
      MANY_CRITERIA.map(({ name, weight, position }) => ({ name, weight, position })),
    )
    const team = parsed.teams[0]
    expect(team).toMatchObject({
      name: 'Wide Team',
      projectName: 'Wide Project',
      theme: 'Theme W',
      repoUrl: 'https://example.test/wide',
    })
    expect(team.scores).toHaveLength(MANY_CRITERIA.length * TWO_JURORS.length)
    expect(parsed.expectedFinals['E1'] as number).toBeCloseTo(data.ranked[0].final as number, 9)
  })

  it('places the metadata block right below the averages row', async () => {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await blobToArrayBuffer(await buildWorkbook(buildManyCriteriaData())))
    const sheet = workbook.getWorksheet('E1')!
    // Criteria rows 2-13, averages row 14, so the block starts at row 15.
    expect(sheet.getCell('B13').value).toBe('Many Criterion 12')
    expect(sheet.getCell('B15').value).toBe('Echipa:')
    expect(sheet.getCell('B16').value).toBe('Wide Team')
    expect(sheet.getCell('B27').value).toMatch(/^- Punctajul/)
  })
})

describe('buildWorkbook (Astra layout, 9 criteria)', () => {
  it('keeps the metadata block at its exact source-sheet cells', async () => {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await blobToArrayBuffer(await buildWorkbook(buildSyntheticData())))
    const sheet = workbook.getWorksheet('E1')!
    expect(sheet.getCell('B12').value).toBe('Echipa:')
    expect(sheet.getCell('B13').value).toBe('Team One')
    expect(sheet.getCell('B15').value).toBe('Numele Proiect:')
    expect(sheet.getCell('B16').value).toBe('Project One')
    expect(sheet.getCell('B18').value).toBe('Tema Proiect:')
    expect(sheet.getCell('B19').value).toBe('Theme A')
    expect(sheet.getCell('B21').value).toBe('Repo GitHub:')
    expect(sheet.getCell('B24').value).toMatch(/^- Punctajul/)
  })
})

describe('buildWorkbook formula-shaped text', () => {
  // exceljs writes a plain string as a shared string, never as a formula, so a
  // formula-shaped name is already inert in the .xlsx -- no apostrophe prefix (which would
  // show up literally in the cell). The CSV export keeps its guard (see csv.test.ts).
  const EVIL = '=HYPERLINK("https://evil.example","click")'

  it('stores a formula-shaped team name as a plain string value, exactly as typed', async () => {
    const data = buildSyntheticData()
    data.teams[0] = { ...data.teams[0], name: EVIL }

    const blob = await buildWorkbook(data)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await blobToArrayBuffer(blob))
    const cell = workbook.getWorksheet('E1')!.getCell(13, 2) // B13: Echipa name

    expect(cell.type).toBe(ExcelJS.ValueType.String)
    expect(cell.formula).toBeUndefined()
    expect(cell.value).toBe(EVIL)

    const parsed = await parseWorkbook(await blobToArrayBuffer(blob))
    expect(parsed.teams.find((t) => t.sheet === 'E1')!.name).toBe(EVIL)
  })

  it('keeps formula-shaped text verbatim on the results and themes sheets too', async () => {
    const data = buildSyntheticData()
    data.teams[0] = { ...data.teams[0], name: EVIL }
    data.themes = [EVIL]

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await blobToArrayBuffer(await buildWorkbook(data)))
    const results = workbook.getWorksheet('Rezultate Partiale')!
    const resultNames = [2, 3, 4].map((row) => results.getCell(row, 2).value)
    expect(resultNames).toContain(EVIL)
    expect(workbook.getWorksheet('Tematica')!.getCell(2, 2).value).toBe(EVIL)
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
