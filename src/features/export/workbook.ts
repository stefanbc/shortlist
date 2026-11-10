import ExcelJS from 'exceljs'
import type { Id } from '@/domain/types'
import type { TeamWithProject } from '@/features/teams/api'
import { guardFormulaInjection } from './csv'
import type { ExportData } from './types'

/** Column the first juror's scores live in on a team sheet (D). Columns A-C are
 * Nr./Criteriu Jurizare/Pondere. */
const FIRST_JUROR_COL = 4
/** Row the first criterion lives in (row 1 is the header row). */
const FIRST_CRITERION_ROW = 2

/** The exact boilerplate text the source sheet carries in B24 of every team sheet. */
const RULES_TEXT =
  '- Punctajul se acorda de la 1 la 5, in incremente de 0.5.\n' +
  '- In cazul neprezentarii unei echipe se acord un punct din oficiu\n' +
  '- Fiecare echipa are la dispozitie 7 min (5 min pitch si 2 min Q&A)'

/** "Mirela Groza" -> "Mirela\nGROZA": the source sheet's juror header style is the
 * first name, a line break, then the last name upper-cased. Profiles only carry a
 * single `displayName`, so this splits on the LAST space -- the part after it is the
 * surname, everything before it (first name, possibly with a middle name) stays as
 * typed. A one-word name (no space) is upper-cased whole, with no second line. */
export function jurorHeaderText(displayName: string): string {
  const trimmed = displayName.trim()
  const lastSpace = trimmed.lastIndexOf(' ')
  if (lastSpace === -1) return trimmed.toUpperCase()
  return `${trimmed.slice(0, lastSpace)}\n${trimmed.slice(lastSpace + 1).toUpperCase()}`
}

/** 1 -> 'A', 26 -> 'Z', 27 -> 'AA', ... */
function columnLetter(col: number): string {
  let letters = ''
  let n = col
  while (n > 0) {
    const remainder = (n - 1) % 26
    letters = String.fromCharCode(65 + remainder) + letters
    n = Math.floor((n - 1) / 26)
  }
  return letters
}

function addThemesSheet(workbook: ExcelJS.Workbook, data: ExportData): void {
  const sheet = workbook.addWorksheet('Tematica')
  sheet.getCell(1, 1).value = 'Nr.'
  sheet.getCell(1, 2).value = 'Tematici posibile'
  sheet.getRow(1).font = { bold: true }
  data.themes.forEach((name, index) => {
    const row = index + 2
    sheet.getCell(row, 1).value = index + 1
    sheet.getCell(row, 2).value = guardFormulaInjection(name)
  })
}

/** Every juror who scored this team, in the order they should appear as columns:
 * currently-assigned jurors (in `data.jurors`' order) first, then any juror found only
 * via a score on this specific team (a former juror resolved into `data.jurors` by
 * `buildExportData`, or -- defensively -- an id missing from it altogether). */
function teamJurorIds(data: ExportData, teamId: Id): Id[] {
  const scoredIds = new Set(data.scores.filter((score) => score.teamId === teamId).map((s) => s.jurorId))
  const ordered = data.jurors.map((juror) => juror.id).filter((id) => scoredIds.has(id))
  const missing = Array.from(scoredIds).filter((id) => !ordered.includes(id))
  return [...ordered, ...missing]
}

function addTeamSheet(workbook: ExcelJS.Workbook, data: ExportData, team: TeamWithProject): void {
  const sheet = workbook.addWorksheet(`E${team.pitchOrder}`)
  const entry = data.ranked.find((r) => r.teamId === team.id)
  const jurorsById = new Map(data.jurors.map((j) => [j.id, j]))
  const jurorIds = teamJurorIds(data, team.id)
  const teamScores = data.scores.filter((s) => s.teamId === team.id)

  sheet.getCell(1, 1).value = 'Nr.'
  sheet.getCell(1, 2).value = 'Criteriu Jurizare'
  sheet.getCell(1, 3).value = 'Pondere'

  jurorIds.forEach((jurorId, index) => {
    const col = FIRST_JUROR_COL + index
    const cell = sheet.getCell(1, col)
    const displayName = jurorsById.get(jurorId)?.displayName ?? jurorId
    cell.value = guardFormulaInjection(jurorHeaderText(displayName))
    cell.alignment = { wrapText: true }
  })

  const scoreCol = FIRST_JUROR_COL + jurorIds.length
  if (jurorIds.length > 0) {
    sheet.getCell(1, scoreCol).value = 'Scor'
  }
  sheet.getRow(1).font = { bold: true }

  data.criteria.forEach((criterion, index) => {
    const row = FIRST_CRITERION_ROW + index
    sheet.getCell(row, 1).value = criterion.position
    sheet.getCell(row, 2).value = guardFormulaInjection(criterion.name)
    sheet.getCell(row, 3).value = criterion.weight

    jurorIds.forEach((jurorId, jurorIndex) => {
      const score = teamScores.find(
        (s) => s.criterionId === criterion.id && s.jurorId === jurorId,
      )
      if (score) {
        sheet.getCell(row, FIRST_JUROR_COL + jurorIndex).value = score.value
      }
    })

    if (jurorIds.length > 0) {
      const firstCol = columnLetter(FIRST_JUROR_COL)
      const lastCol = columnLetter(FIRST_JUROR_COL + jurorIds.length - 1)
      const criterionResult = entry?.criteria.find((c) => c.criterionId === criterion.id)
      const cell = sheet.getCell(row, scoreCol)
      cell.value = {
        formula: `SUM(${firstCol}${row}:${lastCol}${row})*C${row} / COUNTIF(${firstCol}${row}:${lastCol}${row}, "<>")`,
        ...(criterionResult?.weighted !== null && criterionResult?.weighted !== undefined
          ? { result: criterionResult.weighted }
          : {}),
      }
    }
  })

  if (jurorIds.length > 0) {
    const lastCriterionRow = FIRST_CRITERION_ROW + data.criteria.length - 1
    const averageRow = lastCriterionRow + 1

    jurorIds.forEach((jurorId, jurorIndex) => {
      const col = FIRST_JUROR_COL + jurorIndex
      const colLetter = columnLetter(col)
      const average = entry?.jurors.find((j) => j.jurorId === jurorId)?.average
      sheet.getCell(averageRow, col).value = {
        formula: `AVERAGE(${colLetter}${FIRST_CRITERION_ROW}:${colLetter}${lastCriterionRow})`,
        ...(average !== undefined ? { result: average } : {}),
      }
    })

    const scoreColLetter = columnLetter(scoreCol)
    const finalCell = sheet.getCell(averageRow, scoreCol)
    finalCell.value = {
      formula: `SUM(${scoreColLetter}${FIRST_CRITERION_ROW}:${scoreColLetter}${lastCriterionRow}) / SUM(C${FIRST_CRITERION_ROW}:C${lastCriterionRow})`,
      ...(entry?.final !== null && entry?.final !== undefined ? { result: entry.final } : {}),
    }

    const finalLabelCell = sheet.getCell(averageRow, scoreCol + 1)
    finalLabelCell.value = 'Scor\nfinal:'
    finalLabelCell.alignment = { wrapText: true }
  }

  sheet.getCell(12, 2).value = 'Echipa:'
  sheet.getCell(13, 2).value = guardFormulaInjection(team.name)
  sheet.getCell(15, 2).value = 'Numele Proiect:'
  if (team.project.name) sheet.getCell(16, 2).value = guardFormulaInjection(team.project.name)
  sheet.getCell(18, 2).value = 'Tema Proiect:'
  const themeName = team.project.themeId ? data.themeNames[team.project.themeId] : undefined
  if (themeName) sheet.getCell(19, 2).value = guardFormulaInjection(themeName)
  sheet.getCell(21, 2).value = 'Repo GitHub:'
  if (team.project.repoUrl) sheet.getCell(22, 2).value = guardFormulaInjection(team.project.repoUrl)
  sheet.getCell(24, 2).value = RULES_TEXT
}

function addResultsSheet(workbook: ExcelJS.Workbook, data: ExportData): void {
  const sheet = workbook.addWorksheet('Rezultate Partiale')
  sheet.getCell(1, 1).value = 'Nr.'
  sheet.getCell(1, 2).value = 'Echipa'
  sheet.getCell(1, 3).value = 'Nume Proiect'
  sheet.getCell(1, 5).value = 'Punctaj'
  sheet.getRow(1).font = { bold: true }

  const teamsById = new Map(data.teams.map((team) => [team.id, team]))

  data.ranked.forEach((entry, index) => {
    const team = teamsById.get(entry.teamId)
    if (!team) return
    const row = index + 2
    sheet.getCell(row, 1).value = team.pitchOrder
    sheet.getCell(row, 2).value = guardFormulaInjection(team.name)
    sheet.getCell(row, 3).value = guardFormulaInjection(team.project.name ?? '')
    sheet.getCell(row, 4).value = guardFormulaInjection(team.project.description ?? '')
    const finalCell = sheet.getCell(row, 5)
    finalCell.value = {
      formula: `'E${team.pitchOrder}'!J$11`,
      ...(entry.final !== null ? { result: entry.final } : {}),
    }
  })
}

/** Builds an Excel workbook mirroring the organizer's original Google Sheet: a
 * `Tematica` sheet, a `Rezultate Partiale` ranking sheet, and one `E{pitchOrder}` sheet
 * per team with the full criteria x jurors grid and its own live formulas. Every formula
 * cell's cached `result` is set to our already-computed number, so a spreadsheet app
 * shows the right value immediately (no recalculation needed) and `parseWorkbook` can
 * read it straight back via `cell.result`. */
export async function buildWorkbook(data: ExportData): Promise<Blob> {
  const workbook = new ExcelJS.Workbook()
  addThemesSheet(workbook, data)
  addResultsSheet(workbook, data)
  for (const team of data.teams) {
    addTeamSheet(workbook, data, team)
  }
  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}
