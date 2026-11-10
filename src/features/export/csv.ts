import type { ExportData } from './types'

export const CSV_HEADER = ['team', 'project', 'juror', 'criterion', 'weight', 'value'] as const

/** A leading `=`, `+`, `-`, `@`, tab or carriage return lets a spreadsheet app (Excel,
 * Sheets) interpret an opened CSV cell as a formula -- the classic CSV/formula injection
 * vector. Team, project and juror names are user content, so every such field is passed
 * through this guard before being written out. */
const DANGEROUS_LEADING_CHAR = /^[=+\-@\t\r]/

/** Defuses CSV/formula injection by prefixing a dangerous leading character with a single
 * quote. A spreadsheet app opening the CSV treats a leading `'` as "force text" and hides
 * it, so ordinary names are unaffected and a formula-shaped name renders as inert text. */
export function guardFormulaInjection(value: string): string {
  return DANGEROUS_LEADING_CHAR.test(value) ? `'${value}` : value
}

const NEEDS_QUOTING = /[",\r\n]/

/** RFC 4180 field quoting: wrap in double quotes (doubling any embedded quote) whenever
 * the field contains a comma, quote or newline. */
function quoteField(field: string): string {
  return NEEDS_QUOTING.test(field) ? `"${field.replace(/"/g, '""')}"` : field
}

/** The raw scores CSV: one row per individual score (team x criterion x juror), the
 * finest grain the app records. UTF-8 BOM-prefixed so Excel opens it with the right
 * encoding instead of guessing. */
export function buildScoresCsv(data: ExportData): string {
  const teamsById = new Map(data.teams.map((team) => [team.id, team]))
  const criteriaById = new Map(data.criteria.map((criterion) => [criterion.id, criterion]))
  const jurorsById = new Map(data.jurors.map((juror) => [juror.id, juror]))

  const rows = data.scores.map((score) => {
    const team = teamsById.get(score.teamId)
    const criterion = criteriaById.get(score.criterionId)
    const juror = jurorsById.get(score.jurorId)
    return [
      guardFormulaInjection(team?.name ?? score.teamId),
      guardFormulaInjection(team?.project.name ?? ''),
      guardFormulaInjection(juror?.displayName ?? score.jurorId),
      guardFormulaInjection(criterion?.name ?? score.criterionId),
      String(criterion?.weight ?? ''),
      String(score.value),
    ]
  })

  const lines = [[...CSV_HEADER], ...rows].map((row) => row.map(quoteField).join(','))
  const BOM = String.fromCharCode(0xfeff)
  return `${BOM}${lines.join('\r\n')}\r\n`
}
