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

// describe.skipIf still evaluates this callback to register the (skipped) tests,
// so reading the fixture must be guarded rather than done at the top of the body.
describe.skipIf(!FIXTURE_EXISTS)('parseWorkbook + toDomain (astra-hack.xlsx fixture)', () => {
  const data = FIXTURE_EXISTS
    ? toArrayBuffer(readFileSync(FIXTURE))
    : (undefined as unknown as ArrayBuffer)

  it('parses 3 themes and 9 criteria with the expected weights', async () => {
    const parsed = await parseWorkbook(data)

    expect(parsed.themes).toEqual(['Artificial Intelligence', 'Cybersecurity', 'Sustainability'])
    expect(parsed.criteria).toHaveLength(9)
    expect(parsed.criteria.map((c) => c.weight)).toEqual([20, 90, 25, 25, 100, 80, 70, 20, 100])
    expect(parsed.criteria.map((c) => c.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('parses 20 teams with pitch order from the sheet name', async () => {
    const parsed = await parseWorkbook(data)

    expect(parsed.teams).toHaveLength(20)
    expect(parsed.teams.map((t) => t.pitchOrder).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    )

    const e13 = parsed.teams.find((t) => t.sheet === 'E13')
    expect(e13).toMatchObject({
      pitchOrder: 13,
      name: 'Dev.exe',
      projectName: 'AiVee',
      theme: 'Artificial Intelligence',
      repoUrl: 'https://github.com/mariusbuharu-gsd/aivee',
    })
    expect(e13?.description).toMatch(/^AiVee transformă/)
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

  it('identifies 7 distinct jurors and attributes column D to Mirela GROZA on E1 and Ovdia CABA on E18', async () => {
    const parsed = await parseWorkbook(data)

    expect(parsed.jurors).toHaveLength(7)

    const mirela = parsed.jurors.find((j) => j.displayName === 'Mirela GROZA')
    const ovdia = parsed.jurors.find((j) => j.displayName === 'Ovdia CABA')
    expect(mirela).toBeDefined()
    expect(ovdia).toBeDefined()

    const e1 = parsed.teams.find((t) => t.sheet === 'E1')!
    const e18 = parsed.teams.find((t) => t.sheet === 'E18')!
    const e1ColumnDKeys = new Set(e1.scores.map((s) => s.jurorKey))
    const e18ColumnDKeys = new Set(e18.scores.map((s) => s.jurorKey))

    expect(e1ColumnDKeys.has(mirela!.key)).toBe(true)
    expect(e1ColumnDKeys.has(ovdia!.key)).toBe(false)
    expect(e18ColumnDKeys.has(ovdia!.key)).toBe(true)
    expect(e18ColumnDKeys.has(mirela!.key)).toBe(false)
  })

  it('PARITY: computed finals match cached J11 for all 19 scored teams', async () => {
    const parsed = await parseWorkbook(data)
    const { criteria, teams, scores } = toDomain(parsed)

    const scoredSheets = Object.entries(parsed.expectedFinals).filter(([, final]) => final !== null)
    expect(scoredSheets).toHaveLength(19)

    for (const [sheet, expectedFinal] of scoredSheets) {
      const team = teams.find((t) => t.id === sheet)!
      const result = computeTeamResult(team, criteria, scores)
      expect(result.final).toBeCloseTo(expectedFinal as number, 9)
    }

    const bySheet = (sheet: string) => {
      const team = teams.find((t) => t.id === sheet)!
      return computeTeamResult(team, criteria, scores).final
    }
    expect(bySheet('E13')).toBeCloseTo(4.008647799, 9)
    expect(bySheet('E4')).toBeCloseTo(3.695754717, 9)
    expect(bySheet('E5')).toBeCloseTo(2.932861635, 9)
    expect(bySheet('E17')).toBeCloseTo(2.687893082, 9)
  })

  it(
    'PARITY: ranking order of scored teams matches Rezultate Partiale ' +
      '(E15 before E9 reflects our tie-break for their equal finals, not the sheet, which has no tie-break)',
    async () => {
      const parsed = await parseWorkbook(data)
      const { criteria, teams, scores } = toDomain(parsed)

      const ranked = rankTeams(teams, criteria, scores)

      expect(ranked.map((r) => r.teamId)).toEqual([
        'E13',
        'E4',
        'E6',
        'E8',
        'E19',
        'E12',
        'E2',
        'E18',
        'E11',
        'E15',
        'E9',
        'E7',
        'E16',
        'E3',
        'E14',
        'E20',
        'E1',
        'E5',
        'E17',
        'E10',
      ])

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
