import type { Criterion, Id, Score, Team } from './types'

export interface CriterionResult {
  criterionId: Id
  average: number | null
  weighted: number | null
  count: number
}

export interface JurorAverage {
  jurorId: Id
  average: number
}

export interface TeamResult {
  teamId: Id
  final: number | null
  criteria: CriterionResult[]
  jurors: JurorAverage[]
}

export interface RankedTeam extends TeamResult {
  rank: number | null
  tiedWith: Id[]
  tieUnresolved: boolean
}

/** Tolerance for comparing floating-point scores/finals as equal. */
export const SCORE_EPSILON = 1e-9

function approximatelyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < SCORE_EPSILON
}

/**
 * Computes a single team's result from raw scores, mirroring the spreadsheet
 * formula exactly:
 *   - per criterion: weight x average(non-empty juror scores), blanks excluded
 *   - final: sum(criterion weighted scores) / sum(weights of criteria that
 *     received at least one score)
 *   - per juror: plain average of that juror's scores across criteria
 *
 * A no-show team's final is fixed at 1 and its criteria are not evaluated.
 * Only scores whose teamId matches `team` and whose criterionId is in
 * `criteria` are considered.
 */
export function computeTeamResult(team: Team, criteria: Criterion[], scores: Score[]): TeamResult {
  if (team.noShow) {
    return {
      teamId: team.id,
      final: 1,
      criteria: criteria.map((criterion) => ({
        criterionId: criterion.id,
        average: null,
        weighted: null,
        count: 0,
      })),
      jurors: [],
    }
  }

  const criterionIds = new Set(criteria.map((criterion) => criterion.id))
  const relevantScores = scores.filter(
    (score) => score.teamId === team.id && criterionIds.has(score.criterionId),
  )

  const criteriaResults: CriterionResult[] = criteria.map((criterion) => {
    const criterionScores = relevantScores.filter((score) => score.criterionId === criterion.id)
    if (criterionScores.length === 0) {
      return { criterionId: criterion.id, average: null, weighted: null, count: 0 }
    }
    const sum = criterionScores.reduce((total, score) => total + score.value, 0)
    const average = sum / criterionScores.length
    return {
      criterionId: criterion.id,
      average,
      weighted: criterion.weight * average,
      count: criterionScores.length,
    }
  })

  let numerator = 0
  let denominator = 0
  criteria.forEach((criterion, index) => {
    const result = criteriaResults[index]
    if (result.average !== null) {
      numerator += result.weighted as number
      denominator += criterion.weight
    }
  })
  const final = denominator === 0 ? null : numerator / denominator

  const jurorTotals = new Map<Id, { sum: number; count: number }>()
  for (const score of relevantScores) {
    const totals = jurorTotals.get(score.jurorId) ?? { sum: 0, count: 0 }
    totals.sum += score.value
    totals.count += 1
    jurorTotals.set(score.jurorId, totals)
  }
  const jurors: JurorAverage[] = Array.from(jurorTotals.entries()).map(([jurorId, totals]) => ({
    jurorId,
    average: totals.sum / totals.count,
  }))

  return { teamId: team.id, final, criteria: criteriaResults, jurors }
}

/** Criteria ordered for tie-breaking: highest weight first, then lowest position. */
function tieBreakCriteriaOrder(criteria: Criterion[]): Criterion[] {
  return [...criteria].sort((a, b) => {
    if (a.weight !== b.weight) return b.weight - a.weight
    return a.position - b.position
  })
}

interface ComparableResult {
  team: Team
  result: TeamResult
}

/**
 * Compares two already-ranked (non-null final) results for sort order.
 * Returns 0 only when the two are fully tied (same final, same average on
 * every tie-break criterion, and no distinguishing manualTiebreak) — i.e.
 * they belong to the same rank.
 */
function compareRanked(a: ComparableResult, b: ComparableResult, sortedCriteria: Criterion[]): number {
  const aFinal = a.result.final as number
  const bFinal = b.result.final as number
  if (!approximatelyEqual(aFinal, bFinal)) {
    return bFinal - aFinal
  }

  for (const criterion of sortedCriteria) {
    const aAverage = a.result.criteria.find((c) => c.criterionId === criterion.id)?.average ?? null
    const bAverage = b.result.criteria.find((c) => c.criterionId === criterion.id)?.average ?? null

    if (aAverage === null && bAverage === null) continue
    if (aAverage === null) return 1 // null is lowest: a sorts after b
    if (bAverage === null) return -1 // null is lowest: b sorts after a
    if (!approximatelyEqual(aAverage, bAverage)) {
      return bAverage - aAverage
    }
  }

  // A team with no manual order sorts after any team in the same tie that has one --
  // otherwise a partial assignment (only some of the tied teams given an order) would
  // compare as equal to an unordered team and leave the overall sort inconsistent.
  const aTiebreak = a.team.manualTiebreak
  const bTiebreak = b.team.manualTiebreak
  if (aTiebreak !== null || bTiebreak !== null) {
    if (aTiebreak === null) return 1
    if (bTiebreak === null) return -1
    if (aTiebreak !== bTiebreak) return aTiebreak - bTiebreak // lower manual tiebreak wins
  }

  return 0
}

/**
 * Ranks teams by final score (descending), applying the spreadsheet's
 * competition-ranking convention (1, 2, 2, 4) and the criterion/manual
 * tie-break rules. Teams with a null final (no scores, not no-show) are
 * returned last with a null rank.
 */
export function rankTeams(teams: Team[], criteria: Criterion[], scores: Score[]): RankedTeam[] {
  const results: ComparableResult[] = teams.map((team) => ({
    team,
    result: computeTeamResult(team, criteria, scores),
  }))
  const sortedCriteria = tieBreakCriteriaOrder(criteria)

  const ranked = results.filter((r) => r.result.final !== null)
  const unranked = results.filter((r) => r.result.final === null)

  ranked.sort((a, b) => compareRanked(a, b, sortedCriteria))

  const ranks: number[] = []
  ranked.forEach((entry, index) => {
    if (index === 0) {
      ranks.push(1)
      return
    }
    const tiedWithPrevious = compareRanked(ranked[index - 1], entry, sortedCriteria) === 0
    ranks.push(tiedWithPrevious ? ranks[index - 1] : index + 1)
  })

  const rankedTeams: RankedTeam[] = ranked.map((entry, index) => {
    const rank = ranks[index]
    const tiedWith = ranked
      .filter((_, otherIndex) => otherIndex !== index && ranks[otherIndex] === rank)
      .map((other) => other.team.id)
    return {
      ...entry.result,
      rank,
      tiedWith,
      tieUnresolved: rank <= 3 && tiedWith.length > 0,
    }
  })

  const unrankedTeams: RankedTeam[] = unranked.map((entry) => ({
    ...entry.result,
    rank: null,
    tiedWith: [],
    tieUnresolved: false,
  }))

  return [...rankedTeams, ...unrankedTeams]
}
