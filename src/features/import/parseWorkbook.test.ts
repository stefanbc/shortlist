/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { computeTeamResult, rankTeams } from '../../domain/scoring'
import { parseWorkbook, toDomain, WorkbookFormatError } from './parseWorkbook'

// Private fixture: a real export of the organizer's Google Sheet, containing
// real names. It is git-ignored (see fixtures/*.xlsx in .gitignore) and must
// never be committed. Tests that depend on it are skipped when it's absent
// (e.g. a fresh clone without the file handed over out-of-band).
const FIXTURE = path.resolve(import.meta.dirname, '../../../fixtures/astra-hack.xlsx')

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer
}

const FIXTURE_EXISTS = existsSync(FIXTURE)

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** The fixture read raw with exceljs -- an independent view of the same cells, so these
 * tests compare parseWorkbook's output with the sheet itself rather than hard-coding any
 * of its (real, private) names or numbers. */
async function loadRaw(data: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(data)
  return workbook
}

/** Rezultate Partiale's rows (row 1 is the header): pitch order, team name, project name and
 * the cached final (null for an error result such as a no-show's #DIV/0!), in sheet order. */
function resultsRows(workbook: ExcelJS.Workbook) {
  const sheet = workbook.getWorksheet('Rezultate Partiale')!
  const rows: { pitchOrder: number; team: string; project: string; final: number | null }[] = []
  for (let row = 2; row <= sheet.rowCount; row++) {
    const pitchOrder = sheet.getCell(row, 1).value
    if (typeof pitchOrder !== 'number') continue
    const cached = sheet.getCell(row, 5).value as { result?: unknown } | null
    rows.push({
      pitchOrder,
      team: collapse(sheet.getCell(row, 2).text),
      project: collapse(sheet.getCell(row, 3).text),
      final: typeof cached?.result === 'number' ? cached.result : null,
    })
  }
  return rows
}

// describe.skipIf still evaluates this callback to register the (skipped) tests,
// so reading the fixture must be guarded rather than done at the top of the body.
describe.skipIf(!FIXTURE_EXISTS)('parseWorkbook + toDomain (astra-hack.xlsx fixture)', () => {
  const data = FIXTURE_EXISTS
    ? toArrayBuffer(readFileSync(FIXTURE))
    : (undefined as unknown as ArrayBuffer)

  it('parses the themes listed on Tematica and 9 criteria with the sheet\'s weights', async () => {
    const parsed = await parseWorkbook(data)
    const raw = await loadRaw(data)

    const tematica = raw.getWorksheet('Tematica')!
    const sheetThemes: string[] = []
    for (let row = 2; row <= tematica.rowCount; row++) {
      const text = collapse(tematica.getCell(row, 2).text)
      if (text) sheetThemes.push(text)
    }
    expect(sheetThemes.length).toBeGreaterThan(0)
    expect(parsed.themes).toEqual(sheetThemes)

    expect(parsed.criteria).toHaveLength(9)
    expect(parsed.criteria.map((c) => c.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    // Every team sheet carries the same weights in column C, rows 2-10.
    for (const sheet of raw.worksheets.filter((ws) => /^E\d+$/.test(ws.name))) {
      const weights = parsed.criteria.map((c) => sheet.getCell(c.position + 1, 3).value)
      expect(weights, sheet.name).toEqual(parsed.criteria.map((c) => c.weight))
    }
    expect(parsed.criteria.every((c) => c.weight > 0)).toBe(true)
  })

  it('parses 20 teams whose names and projects agree with Rezultate Partiale', async () => {
    const parsed = await parseWorkbook(data)
    const results = resultsRows(await loadRaw(data))

    expect(parsed.teams).toHaveLength(20)
    expect(parsed.teams.map((t) => t.pitchOrder).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    )

    for (const team of parsed.teams) {
      const row = results.find((r) => r.pitchOrder === team.pitchOrder)
      expect(row, team.sheet).toBeDefined()
      expect(team.name, team.sheet).not.toBe('')
      expect(team.name, team.sheet).toBe(row!.team)
      expect(team.projectName ?? '', team.sheet).toBe(row!.project)
      if (team.theme !== null) expect(parsed.themes, team.sheet).toContain(team.theme)
      if (team.repoUrl !== null) expect(team.repoUrl, team.sheet).toMatch(/^https?:\/\//)
    }
    // At least one team carries every piece of metadata, so the label lookups are exercised.
    expect(
      parsed.teams.some((t) => t.projectName && t.theme && t.repoUrl && t.description),
    ).toBe(true)
  })

  it('E17 has a null project name', async () => {
    const parsed = await parseWorkbook(data)

    const e17 = parsed.teams.find((t) => t.sheet === 'E17')
    expect(e17?.projectName).toBeNull()
  })

  it('E10 is a no-show with no scores', async () => {
    const parsed = await parseWorkbook(data)

    const e10 = parsed.teams.find((t) => t.sheet === 'E10')
    expect(e10?.noShow).toBe(true)
    expect(e10?.scores).toEqual([])
  })

  it('identifies 7 distinct jurors, with a different juror in column D on E1 than on E18', async () => {
    const parsed = await parseWorkbook(data)
    const raw = await loadRaw(data)

    expect(parsed.jurors).toHaveLength(7)

    // The sheet's column-D header on each team sheet, read raw (the juror swap mid-event).
    const columnDKey = (sheet: string) =>
      collapse(raw.getWorksheet(sheet)!.getCell(1, 4).text).toLowerCase()
    const e1Key = columnDKey('E1')
    const e18Key = columnDKey('E18')
    expect(e1Key).not.toBe(e18Key)
    expect(parsed.jurors.map((j) => j.key)).toEqual(expect.arrayContaining([e1Key, e18Key]))

    const e1 = parsed.teams.find((t) => t.sheet === 'E1')!
    const e18 = parsed.teams.find((t) => t.sheet === 'E18')!
    const e1Keys = new Set(e1.scores.map((s) => s.jurorKey))
    const e18Keys = new Set(e18.scores.map((s) => s.jurorKey))

    expect(e1Keys.has(e1Key)).toBe(true)
    expect(e1Keys.has(e18Key)).toBe(false)
    expect(e18Keys.has(e18Key)).toBe(true)
    expect(e18Keys.has(e1Key)).toBe(false)
  })

  it('PARITY: computed finals match the cached finals for all 19 scored teams', async () => {
    const parsed = await parseWorkbook(data)
    const { criteria, teams, scores } = toDomain(parsed)

    const scoredSheets = Object.entries(parsed.expectedFinals).filter(([, final]) => final !== null)
    expect(scoredSheets).toHaveLength(19)

    for (const [sheet, expectedFinal] of scoredSheets) {
      const team = teams.find((t) => t.id === sheet)!
      const result = computeTeamResult(team, criteria, scores)
      expect(result.final, sheet).toBeCloseTo(expectedFinal as number, 9)
    }

    // The cached finals parseWorkbook found on the team sheets are the ones Rezultate
    // Partiale shows too.
    for (const row of resultsRows(await loadRaw(data))) {
      const expected = parsed.expectedFinals[`E${row.pitchOrder}`]
      if (row.final === null) expect(expected).toBeNull()
      else expect(expected).toBeCloseTo(row.final, 9)
    }
  })

  it(
    'PARITY: ranking order matches Rezultate Partiale (scored teams in sheet order, ' +
      'ties included, then the no-show last)',
    async () => {
      const parsed = await parseWorkbook(data)
      const { criteria, teams, scores } = toDomain(parsed)
      const results = resultsRows(await loadRaw(data))

      // The sheet lists scored teams by final, descending; a no-show's #DIV/0! row is
      // listed first there but ranks last here (it gets the official 1 point).
      const sheetOrder = [
        ...results.filter((r) => r.final !== null),
        ...results.filter((r) => r.final === null),
      ].map((r) => `E${r.pitchOrder}`)
      const finals = results.filter((r) => r.final !== null).map((r) => r.final as number)
      expect(finals).toEqual([...finals].sort((a, b) => b - a))

      const ranked = rankTeams(teams, criteria, scores)
      expect(ranked.map((r) => r.teamId)).toEqual(sheetOrder)

      const e10 = ranked.find((r) => r.teamId === 'E10')!
      expect(e10.final).toBe(1)
      expect(e10.rank).toBe(ranked.length)
    },
  )
})

describe('WorkbookFormatError', () => {
  it('rejects non-xlsx bytes with code not_xlsx', async () => {
    const bytes = new TextEncoder().encode('this is definitely not an xlsx workbook')

    await expect(parseWorkbook(bytes.buffer)).rejects.toBeInstanceOf(WorkbookFormatError)
    await expect(parseWorkbook(bytes.buffer)).rejects.toMatchObject({ code: 'not_xlsx' })
  })

  it('rejects a workbook with no E-sheets with code no_team_sheets', async () => {
    const workbook = new ExcelJS.Workbook()
    workbook.addWorksheet('Tematica')
    workbook.addWorksheet('Rezultate Partiale')
    const buffer = await workbook.xlsx.writeBuffer()

    await expect(parseWorkbook(buffer as ArrayBuffer)).rejects.toBeInstanceOf(WorkbookFormatError)
    await expect(parseWorkbook(buffer as ArrayBuffer)).rejects.toMatchObject({
      code: 'no_team_sheets',
    })
  })
})
