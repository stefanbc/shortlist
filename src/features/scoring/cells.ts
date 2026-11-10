import type { TFunction } from 'i18next'
import type { Criterion, Id } from '@/domain/types'
import { scoreKey, type RejectReason } from '@/stores/scoreQueue'
import type { CellSync } from './api'

/** What the juror sees for one criterion of the team being scored. */
export type CellView =
  | { state: 'empty' }
  | { state: 'saved' | 'pending'; value: number }
  /** The server refused the tap: the value is shown, but it is not saved. */
  | { state: 'rejected'; value: number | null; reason: RejectReason }

/** Every score a juror can give: 1 to 5 in half steps. */
export const SCORE_VALUES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5] as const

export function cellViews(
  teamId: Id,
  criteria: Criterion[],
  scores: Record<string, number>,
  sync: Record<string, CellSync>,
): CellView[] {
  return criteria.map((criterion) => {
    const key = scoreKey(teamId, criterion.id)
    const value = scores[key]
    const cell = sync[key]
    if (cell?.status === 'rejected')
      return { state: 'rejected', value: value ?? null, reason: cell.reason }
    if (value === undefined) return { state: 'empty' }
    return { state: cell?.status === 'pending' ? 'pending' : 'saved', value }
  })
}

/** Criteria with a score the server has (or will) accept; rejected taps don't count. */
export const countScored = (cells: CellView[]) =>
  cells.filter((cell) => cell.state === 'saved' || cell.state === 'pending').length

export function formatScore(value: number, language: string): string {
  return new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value)
}

/** The screen-reader name for a criterion tile or row: number, name and score state. */
export function cellLabel(
  t: TFunction,
  language: string,
  criterion: Criterion,
  n: number,
  cell: CellView,
) {
  const value = 'value' in cell && cell.value !== null ? formatScore(cell.value, language) : '–'
  const state =
    cell.state === 'empty'
      ? t('scoring.tileNoScore')
      : cell.state === 'rejected'
        ? t('scoring.tileNotSaved', { value })
        : cell.state === 'pending'
          ? t('scoring.tilePending', { value })
          : t('scoring.tileScore', { value })
  return t('scoring.tileLabel', { n, name: criterion.name, state })
}
