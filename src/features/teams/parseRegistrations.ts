import type ExcelJS from 'exceljs'

/**
 * Reads the team registration sheet: the Google Form responses, downloaded from Google
 * Sheets as .xlsx or .csv. One row is one team.
 *
 * Only what the app shows is kept: team name, member names, project name, theme,
 * description and repository link. Phone numbers, e-mail addresses, ages, the school or
 * company and the consent answers are read past and never leave the organizer's browser.
 */

export const MAX_MEMBERS = 5
const NAME_MAX = 120
const DESCRIPTION_MAX = 5000

export type RegistrationIssue =
  /** The row has no team name, so there is nothing to import. */
  | 'missingName'
  /** The same team registered again later in the sheet; the later row wins. */
  | 'duplicateInFile'
  /** A team with this name is already in the event. */
  | 'alreadyInEvent'
  /** The repository answer isn't a usable link; the team is imported without it. */
  | 'badRepoUrl'
  /** The description was longer than the app stores and was cut. */
  | 'descriptionTrimmed'

export interface ParsedRegistration {
  /** Row number in the sheet (the header is row 1). */
  row: number
  name: string
  members: string[]
  projectName: string | null
  themeName: string | null
  description: string | null
  repoUrl: string | null
  issues: RegistrationIssue[]
  /** Skipped rows are shown in the preview but not imported. */
  skip: boolean
}

export type RegistrationFormatErrorCode = 'unreadable' | 'empty' | 'no_team_column'

export class RegistrationFormatError extends Error {
  readonly code: RegistrationFormatErrorCode
  constructor(code: RegistrationFormatErrorCode) {
    super(code)
    this.code = code
  }
}

/** Lowercase, no diacritics, single spaces, no trailing punctuation: how headers and
 * names are compared ("Numele echipei:" and "numele  echipei" are the same column). */
export function normalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // Romanian comma-below letters decompose, but the cedilla forms are common in exports.
    .replace(/[şș]/g, 's')
    .replace(/[ţț]/g, 't')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\s:.*]+$/g, '')
    .trim()
}

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    // Hyperlink cells ({ text, hyperlink }), rich text and formula results.
    if ('hyperlink' in value && typeof value.hyperlink === 'string') {
      return typeof value.text === 'string' ? value.text : value.hyperlink
    }
    if ('richText' in value) return value.richText.map((part) => part.text).join('')
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue)
    if ('text' in value && typeof value.text === 'string') return value.text
    return ''
  }
  return String(value)
}

async function xlsxRows(data: ArrayBuffer): Promise<string[][]> {
  // Loaded on demand: the workbook reader is large and only this import needs it.
  const { default: Excel } = await import('exceljs')
  const workbook = new Excel.Workbook()
  await workbook.xlsx.load(data)
  const sheet = workbook.worksheets[0]
  if (!sheet) return []
  const rows: string[][] = []
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = []
    for (let column = 1; column <= sheet.columnCount; column += 1) {
      cells.push(cellText(row.getCell(column).value))
    }
    rows.push(cells)
  })
  return rows
}

/** .xlsx files are zip archives and start with "PK". Anything else is read as CSV. */
function isZip(data: ArrayBuffer): boolean {
  const bytes = new Uint8Array(data, 0, Math.min(2, data.byteLength))
  return bytes[0] === 0x50 && bytes[1] === 0x4b
}

export async function readRegistrationRows(data: ArrayBuffer): Promise<string[][]> {
  try {
    if (isZip(data)) return await xlsxRows(data)
    return parseCsv(new TextDecoder('utf-8').decode(data))
  } catch {
    throw new RegistrationFormatError('unreadable')
  }
}

function clean(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function orNull(value: string): string | null {
  return value === '' ? null : value
}

/** Accepts a full link, or a bare "github.com/team/repo" that only lacks the scheme. */
export function normalizeRepoUrl(value: string): string | null {
  const text = value.trim()
  if (text === '') return null
  const candidate = /^https?:\/\//i.test(text) ? text : /^[\w-]+(\.[\w-]+)+\//.test(text) ? `https://${text}` : null
  if (!candidate || /\s/.test(candidate)) return null
  try {
    const url = new URL(candidate)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

interface Columns {
  team: number
  members: number[]
  projectName: number | null
  theme: number | null
  description: number | null
  repo: number | null
}

function findColumns(header: string[]): Columns {
  const labels = header.map(normalizeLabel)
  const first = (test: (label: string) => boolean): number | null => {
    const index = labels.findIndex(test)
    return index < 0 ? null : index
  }
  const team = first((label) => label.startsWith('numele echipei') || label === 'team name')
  if (team === null) throw new RegistrationFormatError('no_team_column')

  const members: number[] = []
  labels.forEach((label, index) => {
    if (label.startsWith('nume complet') && label.includes('membru')) members.push(index)
  })

  return {
    team,
    members: members.slice(0, MAX_MEMBERS),
    projectName: first((label) => label.startsWith('numele proiectului')),
    theme: first((label) => label.startsWith('tema proiectului')),
    description: first((label) => label.startsWith('scopul si conceptul')),
    repo: first((label) => label.startsWith('repository') || label.includes('github')),
  }
}

/**
 * Turns the sheet's rows into teams ready to preview. `existingTeamNames` are the teams
 * already in the event: a registration with the same name is skipped rather than doubled.
 */
export function parseRegistrationRows(
  rows: string[][],
  existingTeamNames: string[] = [],
): ParsedRegistration[] {
  const nonEmpty = rows
    .map((cells, index) => ({ cells, row: index + 1 }))
    .filter(({ cells }) => cells.some((cell) => clean(cell) !== ''))
  if (nonEmpty.length < 2) throw new RegistrationFormatError('empty')

  const columns = findColumns(nonEmpty[0].cells)
  const existing = new Set(existingTeamNames.map(normalizeLabel))
  const at = (cells: string[], index: number | null) => (index === null ? '' : clean(cells[index]))

  const parsed = nonEmpty.slice(1).map(({ cells, row }): ParsedRegistration => {
    const issues: RegistrationIssue[] = []
    const name = at(cells, columns.team).slice(0, NAME_MAX)
    const members = columns.members.map((index) => at(cells, index)).filter((member) => member !== '')

    const repoAnswer = at(cells, columns.repo)
    const repoUrl = normalizeRepoUrl(repoAnswer)
    if (repoAnswer !== '' && repoUrl === null) issues.push('badRepoUrl')

    // Descriptions keep their line breaks; only the ends are trimmed.
    let description = (columns.description === null ? '' : (cells[columns.description] ?? '')).trim()
    if (description.length > DESCRIPTION_MAX) {
      description = description.slice(0, DESCRIPTION_MAX)
      issues.push('descriptionTrimmed')
    }

    if (name === '') issues.push('missingName')
    else if (existing.has(normalizeLabel(name))) issues.push('alreadyInEvent')

    return {
      row,
      name,
      members,
      projectName: orNull(at(cells, columns.projectName)),
      themeName: orNull(at(cells, columns.theme).slice(0, NAME_MAX)),
      description: orNull(description),
      repoUrl,
      issues,
      skip: false,
    }
  })

  // A team that submitted the form twice: the later answer is the one they meant.
  const lastRowByName = new Map<string, number>()
  for (const entry of parsed) if (entry.name !== '') lastRowByName.set(normalizeLabel(entry.name), entry.row)
  for (const entry of parsed) {
    if (entry.name !== '' && lastRowByName.get(normalizeLabel(entry.name)) !== entry.row) {
      entry.issues.push('duplicateInFile')
    }
    entry.skip = entry.issues.some(
      (issue) => issue === 'missingName' || issue === 'duplicateInFile' || issue === 'alreadyInEvent',
    )
  }
  return parsed
}

export async function parseRegistrations(
  data: ArrayBuffer,
  existingTeamNames: string[] = [],
): Promise<ParsedRegistration[]> {
  return parseRegistrationRows(await readRegistrationRows(data), existingTeamNames)
}
