import ExcelJS from 'exceljs'
import type { Id } from '@/domain/types'
import type { TeamWithProject } from '@/features/teams/api'
import type { ExportData } from './types'

/** Column the first juror's scores live in on a team sheet (D). Columns A-C are
 * Nr./Criteriu Jurizare/Pondere. */
const FIRST_JUROR_COL = 4
/** Row the first criterion lives in (row 1 is the header row). */
const FIRST_CRITERION_ROW = 2

/** Row the team metadata block ("Echipa:" ...) starts on in the source sheet: B12, right
 * under its 9-criteria grid and averages row. A sheet with more criteria moves the block
 * down so it always starts on the row after the averages row instead of overwriting the
 * grid. */
const ASTRA_METADATA_ROW = 12

/** The exact boilerplate text the source sheet carries in B24 of every team sheet. */
const RULES_TEXT =
  '- Punctajul se acorda de la 1 la 5, in incremente de 0.5.\n' +
  '- In cazul neprezentarii unei echipe se acord un punct din oficiu\n' +
  '- Fiecare echipa are la dispozitie 7 min (5 min pitch si 2 min Q&A)'

/** "Alex Example" -> "Alex\nEXAMPLE": the source sheet's juror header style is the
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
    sheet.getCell(row, 2).value = name
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

/** Where a team's own "Scor"/final cell lands on its own `E{pitchOrder}` sheet: the
 * column right after its last juror column, on the row right after the last criterion
 * row (Ruling R17 -- this is NOT always J11; that's only true for a 9-criteria,
 * 6-juror sheet, Astra Hack's shape). `null` for a team with no juror columns at all
 * (a no-show, which carries no Scor column either). Shared by `addTeamSheet` (which
 * writes the cell) and `addResultsSheet` (whose cross-sheet formula must point at it). */
function teamFinalCell(data: ExportData, teamId: Id): { col: number; row: number } | null {
  const jurorCount = teamJurorIds(data, teamId).length
  if (jurorCount === 0) return null
  return { col: FIRST_JUROR_COL + jurorCount, row: FIRST_CRITERION_ROW + data.criteria.length }
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
    cell.value = jurorHeaderText(displayName)
    cell.alignment = { wrapText: true }
  })

  const finalCell = teamFinalCell(data, team.id)
  if (finalCell) {
    sheet.getCell(1, finalCell.col).value = 'Scor'
  }
  sheet.getRow(1).font = { bold: true }

  data.criteria.forEach((criterion, index) => {
    const row = FIRST_CRITERION_ROW + index
    sheet.getCell(row, 1).value = criterion.position
    sheet.getCell(row, 2).value = criterion.name
    sheet.getCell(row, 3).value = criterion.weight

    jurorIds.forEach((jurorId, jurorIndex) => {
      const score = teamScores.find(
        (s) => s.criterionId === criterion.id && s.jurorId === jurorId,
      )
      if (score) {
        sheet.getCell(row, FIRST_JUROR_COL + jurorIndex).value = score.value
      }
    })

    if (finalCell) {
      const firstCol = columnLetter(FIRST_JUROR_COL)
      const lastCol = columnLetter(FIRST_JUROR_COL + jurorIds.length - 1)
      const criterionResult = entry?.criteria.find((c) => c.criterionId === criterion.id)
      const cell = sheet.getCell(row, finalCell.col)
      cell.value = {
        formula: `SUM(${firstCol}${row}:${lastCol}${row})*C${row} / COUNTIF(${firstCol}${row}:${lastCol}${row}, "<>")`,
        ...(criterionResult?.weighted !== null && criterionResult?.weighted !== undefined
          ? { result: criterionResult.weighted }
          : {}),
      }
    }
  })

  if (finalCell) {
    const lastCriterionRow = FIRST_CRITERION_ROW + data.criteria.length - 1
    const averageRow = finalCell.row

    jurorIds.forEach((jurorId, jurorIndex) => {
      const col = FIRST_JUROR_COL + jurorIndex
      const colLetter = columnLetter(col)
      const average = entry?.jurors.find((j) => j.jurorId === jurorId)?.average
      sheet.getCell(averageRow, col).value = {
        formula: `AVERAGE(${colLetter}${FIRST_CRITERION_ROW}:${colLetter}${lastCriterionRow})`,
        ...(average !== undefined ? { result: average } : {}),
      }
    })

    const scoreColLetter = columnLetter(finalCell.col)
    const finalValueCell = sheet.getCell(averageRow, finalCell.col)
    finalValueCell.value = {
      formula: `SUM(${scoreColLetter}${FIRST_CRITERION_ROW}:${scoreColLetter}${lastCriterionRow}) / SUM(C${FIRST_CRITERION_ROW}:C${lastCriterionRow})`,
      ...(entry?.final !== null && entry?.final !== undefined ? { result: entry.final } : {}),
    }

    const finalLabelCell = sheet.getCell(averageRow, finalCell.col + 1)
    finalLabelCell.value = 'Scor\nfinal:'
    finalLabelCell.alignment = { wrapText: true }
  }

  // Offsets within the block mirror the source sheet: B12/B13, B15/B16, B18/B19, B21/B22,
  // B24 for Astra's 9 criteria. `parseWorkbook` finds every value by its label, not by row.
  const averagesRow = FIRST_CRITERION_ROW + data.criteria.length
  const top = Math.max(ASTRA_METADATA_ROW, averagesRow + 1)
  sheet.getCell(top, 2).value = 'Echipa:'
  sheet.getCell(top + 1, 2).value = team.name
  sheet.getCell(top + 3, 2).value = 'Numele Proiect:'
  if (team.project.name) sheet.getCell(top + 4, 2).value = team.project.name
  sheet.getCell(top + 6, 2).value = 'Tema Proiect:'
  const themeName = team.project.themeId ? data.themeNames[team.project.themeId] : undefined
  if (themeName) sheet.getCell(top + 7, 2).value = themeName
  sheet.getCell(top + 9, 2).value = 'Repo GitHub:'
  if (team.project.repoUrl) sheet.getCell(top + 10, 2).value = team.project.repoUrl
  sheet.getCell(top + 12, 2).value = RULES_TEXT
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
    sheet.getCell(row, 2).value = team.name
    sheet.getCell(row, 3).value = team.project.name ?? ''
    sheet.getCell(row, 4).value = team.project.description ?? ''
    const finalCell = sheet.getCell(row, 5)
    const teamFinal = teamFinalCell(data, team.id)
    if (teamFinal) {
      // Points at wherever this team's own final actually landed on its sheet (Ruling
      // R17) -- only ever column J, row 11 for a 9-criteria/6-juror sheet.
      const cellRef = `${columnLetter(teamFinal.col)}$${teamFinal.row}`
      finalCell.value = {
        formula: `'E${team.pitchOrder}'!${cellRef}`,
        ...(entry.final !== null ? { result: entry.final } : {}),
      }
    } else if (entry.final !== null) {
      // No-show (or otherwise juror-less) team: its own sheet has no Scor column to
      // point at, so there's nothing to reference live -- write the plain number.
      finalCell.value = entry.final
    }
  })
}

/** Builds an Excel workbook mirroring the organizer's original Google Sheet: a
 * `Tematica` sheet, a `Rezultate Partiale` ranking sheet, and one `E{pitchOrder}` sheet
 * per team with the full criteria x jurors grid and its own live formulas. Every formula
 * cell's cached `result` is set to our already-computed number, so a spreadsheet app
 * shows the right value immediately (no recalculation needed) and `parseWorkbook` can
 * read it straight back via `cell.result`. Text cells are written as plain strings, which
 * exceljs stores as shared strings, never formulas -- so formula-shaped names are inert
 * here without the apostrophe prefix the CSV export needs (it would show literally). */
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
