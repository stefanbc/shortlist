import { useMemo } from 'react'
import type { Id } from '@/domain/types'
import { useEventResults } from '@/features/reports/useEventResults'

export type JurorProgress = {
  /** Teams the juror has scored on every criterion. */
  complete: number
  /** Teams the juror has started but not finished. */
  started: number
  /** Teams there are to score (no-shows don't count). */
  total: number
}

/** How far each juror has got with this event's scoring, from the live scores. */
export function useJurorProgress(eventId: Id): Map<Id, JurorProgress> {
  const { teams, criteria, scores } = useEventResults(eventId)
  return useMemo(() => {
    const scorable = new Set(teams.filter((team) => !team.noShow).map((team) => team.id))
    const criterionIds = new Set(criteria.map((criterion) => criterion.id))
    const perTeam = new Map<Id, Map<Id, number>>()
    for (const score of scores) {
      if (!scorable.has(score.teamId) || !criterionIds.has(score.criterionId)) continue
      const teamsOfJuror = perTeam.get(score.jurorId) ?? new Map<Id, number>()
      teamsOfJuror.set(score.teamId, (teamsOfJuror.get(score.teamId) ?? 0) + 1)
      perTeam.set(score.jurorId, teamsOfJuror)
    }
    const result = new Map<Id, JurorProgress>()
    for (const [jurorId, counts] of perTeam) {
      let complete = 0
      let started = 0
      for (const count of counts.values()) {
        if (criterionIds.size > 0 && count >= criterionIds.size) complete += 1
        else started += 1
      }
      result.set(jurorId, { complete, started, total: scorable.size })
    }
    // Jurors with no scores yet still need the total, so the caller falls back to this.
    result.set('' as Id, { complete: 0, started: 0, total: scorable.size })
    return result
  }, [teams, criteria, scores])
}
