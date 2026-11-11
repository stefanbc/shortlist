import type { Criterion, Id, Score } from './types'

export interface CriterionStat {
  criterionId: Id
  /** Mean of all scores on this criterion. */
  mean: number | null
  /** Population stdev of per-team averages for this criterion. */
  spread: number | null
}

export interface Outlier {
  teamId: Id
  criterionId: Id
  value: number
  othersMean: number
}

export interface JurorStat {
  jurorId: Id
  count: number
  mean: number
  spread: number
  bias: number
  tendency: 'lenient' | 'harsh' | 'neutral'
  outliers: Outlier[]
}

/** |value - othersMean| at or above this is flagged as an outlier. */
export const OUTLIER_DELTA = 1.5
/** |bias| at or above this earns a lenient/harsh tendency label. */
export const TENDENCY_DELTA = 0.5

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/** Population standard deviation (divides by N, not N-1). */
function populationStdev(values: number[]): number {
  if (values.length === 0) return 0
  const avg = mean(values)
  const variance = mean(values.map((value) => (value - avg) ** 2))
  return Math.sqrt(variance)
}

/**
 * Per-criterion mean and spread across all teams, sorted by spread
 * descending (the most discriminating criterion first); criteria with no
 * scores have a null mean/spread and sort last.
 */
export function criterionStats(criteria: Criterion[], scores: Score[]): CriterionStat[] {
  const stats: CriterionStat[] = criteria.map((criterion) => {
    const criterionScores = scores.filter((score) => score.criterionId === criterion.id)
    if (criterionScores.length === 0) {
      return { criterionId: criterion.id, mean: null, spread: null }
    }

    const criterionMean = mean(criterionScores.map((score) => score.value))

    const teamTotals = new Map<Id, { sum: number; count: number }>()
    for (const score of criterionScores) {
      const totals = teamTotals.get(score.teamId) ?? { sum: 0, count: 0 }
      totals.sum += score.value
      totals.count += 1
      teamTotals.set(score.teamId, totals)
    }
    const teamAverages = Array.from(teamTotals.values()).map((totals) => totals.sum / totals.count)
    const spread = populationStdev(teamAverages)

    return { criterionId: criterion.id, mean: criterionMean, spread }
  })

  return stats.sort((a, b) => {
    if (a.spread === null && b.spread === null) return 0
    if (a.spread === null) return 1
    if (b.spread === null) return -1
    return b.spread - a.spread
  })
}

/**
 * Per-juror scoring stats. `bias` is the mean, over the juror's own scored
 * cells, of (value - mean of other jurors' values on that same team+
 * criterion); cells no other juror scored are skipped entirely (they
 * contribute to neither bias nor outliers). An outlier is a cell where
 * |value - othersMean| >= OUTLIER_DELTA. Tendency follows bias >= +0.5
 * (lenient) / <= -0.5 (harsh) / otherwise neutral.
 */
export function jurorStats(scores: Score[]): JurorStat[] {
  const jurorIds: Id[] = []
  for (const score of scores) {
    if (!jurorIds.includes(score.jurorId)) jurorIds.push(score.jurorId)
  }

  return jurorIds.map((jurorId) => {
    const jurorScores = scores.filter((score) => score.jurorId === jurorId)
    const count = jurorScores.length
    const jurorMean = mean(jurorScores.map((score) => score.value))
    const spread = populationStdev(jurorScores.map((score) => score.value))

    const outliers: Outlier[] = []
    const biasValues: number[] = []

    for (const score of jurorScores) {
      const others = scores.filter(
        (other) =>
          other.teamId === score.teamId &&
          other.criterionId === score.criterionId &&
          other.jurorId !== jurorId,
      )
      if (others.length === 0) continue

      const othersMean = mean(others.map((other) => other.value))
      biasValues.push(score.value - othersMean)

      if (Math.abs(score.value - othersMean) >= OUTLIER_DELTA) {
        outliers.push({
          teamId: score.teamId,
          criterionId: score.criterionId,
          value: score.value,
          othersMean,
        })
      }
    }

    const bias = biasValues.length > 0 ? mean(biasValues) : 0
    const tendency: JurorStat['tendency'] =
      bias >= TENDENCY_DELTA ? 'lenient' : bias <= -TENDENCY_DELTA ? 'harsh' : 'neutral'

    return { jurorId, count, mean: jurorMean, spread, bias, tendency, outliers }
  })
}
