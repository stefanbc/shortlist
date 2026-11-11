import ExcelJS from 'exceljs'
import type { Criterion, Score, Team } from '../../domain/types'

export interface ParsedJuror {
  key: string // lowercased, whitespace-collapsed name
  displayName: string
}

export interface ParsedTeam {
  sheet: string
  pitchOrder: number
  name: string
  projectName: string | null
  theme: string | null
  repoUrl: string | null
  description: string | null
  noShow: boolean
  scores: { criterionPosition: number; jurorKey: string; value: number }[]
}

export interface ParsedEvent {
  themes: string[]
  criteria: { name: string; weight: number; position: number }[]
  jurors: ParsedJuror[]
  teams: ParsedTeam[]
  expectedFinals: Record<string, number | null> // from cached J11
}

export type WorkbookFormatErrorCode = 'not_xlsx' | 'no_team_sheets' | 'no_criteria'

export class WorkbookFormatError extends Error {
  code: WorkbookFormatErrorCode

  constructor(code: WorkbookFormatErrorCode, message: string) {
    super(message)
    this.name = 'WorkbookFormatError'
    this.code = code
  }
}

const TEAM_SHEET_NAME = /^E(\d+)$/
const METADATA_LABELS = ['Echipa:', 'Numele Proiect:', 'Tema Proiect:', 'Repo GitHub:']
const THEMES_SHEET = 'Tematica'
const RESULTS_SHEET = 'Rezultate Partiale'

/** Reads the plain-text content of a cell, regardless of how exceljs modeled its value. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'object') {
    if ('richText' in value) {
      return value.richText.map((part) => part.text).join('')
    }
    if ('text' in value) {
      return value.text
    }
    if ('result' in value && typeof value.result === 'string') {
      return value.result
    }
  }
  return ''
}

/** Reads a cell's numeric result, including the cached result of a formula cell. Error results (e.g. #DIV/0!) yield null. */
function numericResult(value: ExcelJS.CellValue): number | null {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'result' in value && typeof value.result === 'number') {
    return value.result
  }
  return null
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function jurorKeyFor(displayName: string): string {
  return collapseWhitespace(displayName).toLowerCase()
}

/**
 * Finds a label in column B (e.g. "Echipa:") and returns the next non-empty
 * cell below it in column B, trimmed. Returns null if the cell immediately
 * following is blank all the way down to the next known label, or if the
 * label itself isn't found.
 */
function findMetadataValue(sheet: ExcelJS.Worksheet, label: string): string | null {
  let labelRow: number | null = null
  for (let row = 1; row <= sheet.rowCount; row++) {
    if (collapseWhitespace(cellText(sheet.getCell(row, 2).value)) === label) {
      labelRow = row
      break
    }
  }
  if (labelRow === null) return null

  for (let row = labelRow + 1; row <= sheet.rowCount; row++) {
    const text = collapseWhitespace(cellText(sheet.getCell(row, 2).value))
    if (text === '') continue
    if (METADATA_LABELS.includes(text)) return null // hit the next label before finding a value
    return text
  }
  return null
}

/** Criteria rows from the first team sheet: column A numeric, B = name, C = weight. */
function parseCriteria(
  sheet: ExcelJS.Worksheet,
): { name: string; weight: number; position: number }[] {
  const criteria: { name: string; weight: number; position: number }[] = []
  for (let row = 2; ; row++) {
    const position = sheet.getCell(row, 1).value
    if (typeof position !== 'number') break
    const name = collapseWhitespace(cellText(sheet.getCell(row, 2).value))
    const weight = sheet.getCell(row, 3).value
    criteria.push({ position, name, weight: typeof weight === 'number' ? weight : 0 })
  }
  return criteria
}

/** Juror columns from column D (4) up to (excluding) the header starting with "Scor",
 * plus that "Scor" column's index itself (Ruling R17: the cached final's cell must be
 * located dynamically -- it's only ever at the fixed address J11 by coincidence, for a
 * sheet shaped like Astra Hack's (6 juror columns). A sheet with no "Scor" header at all
 * (this exporter's no-show teams, which carry no juror columns) yields `scoreCol: null`. */
function parseJurorColumns(
  sheet: ExcelJS.Worksheet,
): { jurors: { col: number; key: string; displayName: string }[]; scoreCol: number | null } {
  const jurors: { col: number; key: string; displayName: string }[] = []
  let scoreCol: number | null = null
  const maxCol = Math.max(sheet.columnCount, 4) + 5 // tolerate a little slack beyond the reported extent
  for (let col = 4; col <= maxCol; col++) {
    const header = collapseWhitespace(cellText(sheet.getCell(1, col).value))
    if (header === '') break
    if (header.startsWith('Scor')) {
      scoreCol = col
      break
    }
    jurors.push({ col, key: jurorKeyFor(header), displayName: header })
  }
  return { jurors, scoreCol }
}

function parseThemes(workbook: ExcelJS.Workbook): string[] {
  const sheet = workbook.getWorksheet(THEMES_SHEET)
  if (!sheet) return []
  const themes: string[] = []
  for (let row = 2; row <= sheet.rowCount; row++) {
    const text = collapseWhitespace(cellText(sheet.getCell(row, 2).value))
    if (text !== '') themes.push(text)
  }
  return themes
}

/** Rezultate Partiale: row whose column A equals the team number, column D is the description. */
function parseDescription(workbook: ExcelJS.Workbook, teamNumber: number): string | null {
  const sheet = workbook.getWorksheet(RESULTS_SHEET)
  if (!sheet) return null
  for (let row = 1; row <= sheet.rowCount; row++) {
    if (sheet.getCell(row, 1).value === teamNumber) {
      const text = cellText(sheet.getCell(row, 4).value).trim()
      return text === '' ? null : text
    }
  }
  return null
}

export async function parseWorkbook(data: ArrayBuffer): Promise<ParsedEvent> {
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(data)
  } catch {
    throw new WorkbookFormatError('not_xlsx', 'The file could not be read as an .xlsx workbook.')
  }

  const teamSheets = workbook.worksheets.filter((sheet) => TEAM_SHEET_NAME.test(sheet.name))
  if (teamSheets.length === 0) {
    throw new WorkbookFormatError(
      'no_team_sheets',
      'The workbook has no team sheets (expected sheet names like "E1", "E2", ...).',
    )
  }

  const criteria = parseCriteria(teamSheets[0])
  if (criteria.length === 0) {
    throw new WorkbookFormatError(
      'no_criteria',
      `Sheet "${teamSheets[0].name}" has no criteria rows (expected numeric values from column A, row 2).`,
    )
  }

  const themes = parseThemes(workbook)

  const jurorsByKey = new Map<string, ParsedJuror>()
  const teams: ParsedTeam[] = []
  const expectedFinals: Record<string, number | null> = {}

  // The cached final always sits one row below the last criterion row (row 1 is the
  // header, criteria start at row 2) -- true for every team sheet, since criteria are
  // the same across the whole workbook (parsed once, above, from the first team sheet).
  const finalRow = criteria.length + 2

  for (const sheet of teamSheets) {
    const pitchOrder = Number(TEAM_SHEET_NAME.exec(sheet.name)![1])
    const { jurors: jurorColumns, scoreCol } = parseJurorColumns(sheet)
    for (const juror of jurorColumns) {
      if (!jurorsByKey.has(juror.key)) {
        jurorsByKey.set(juror.key, { key: juror.key, displayName: juror.displayName })
      }
    }

    const scores: ParsedTeam['scores'] = []
    for (const criterion of criteria) {
      const row = criterion.position + 1 // row 1 is the header
      for (const juror of jurorColumns) {
        const value = sheet.getCell(row, juror.col).value
        if (typeof value === 'number') {
          scores.push({ criterionPosition: criterion.position, jurorKey: juror.key, value })
        }
      }
    }

    teams.push({
      sheet: sheet.name,
      pitchOrder,
      name: findMetadataValue(sheet, 'Echipa:') ?? '',
      projectName: findMetadataValue(sheet, 'Numele Proiect:'),
      theme: findMetadataValue(sheet, 'Tema Proiect:'),
      repoUrl: findMetadataValue(sheet, 'Repo GitHub:'),
      description: parseDescription(workbook, pitchOrder),
      noShow: scores.length === 0,
      scores,
    })

    expectedFinals[sheet.name] =
      scoreCol === null ? null : numericResult(sheet.getCell(finalRow, scoreCol).value)
  }

  return {
    themes,
    criteria,
    jurors: Array.from(jurorsByKey.values()),
    teams,
    expectedFinals,
  }
}

export function toDomain(parsed: ParsedEvent): {
  criteria: Criterion[]
  teams: Team[]
  scores: Score[]
} {
  const criteria: Criterion[] = parsed.criteria.map((criterion) => ({
    id: String(criterion.position),
    name: criterion.name,
    weight: criterion.weight,
    position: criterion.position,
  }))

  const teams: Team[] = parsed.teams.map((team) => ({
    id: team.sheet,
    name: team.name,
    pitchOrder: team.pitchOrder,
    noShow: team.noShow,
    manualTiebreak: null,
  }))

  const scores: Score[] = parsed.teams.flatMap((team) =>
    team.scores.map((score) => ({
      teamId: team.sheet,
      criterionId: String(score.criterionPosition),
      jurorId: score.jurorKey,
      value: score.value,
    })),
  )

  return { criteria, teams, scores }
}
