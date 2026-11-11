import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { RankedTeam } from '@/domain/scoring'
import type { Id } from '@/domain/types'
import type { TeamWithProject } from '@/features/teams/api'
import type { Profile } from '@/stores/session'

/** Looks up a juror's display name: currently-assigned jurors first (the common case),
 * then any other known profile -- a juror later removed from the event, whose past scores
 * still count toward the results (a juror replaced mid-event) even though they no longer
 * have a row in `assignedJurors`. Falls back to `formerJurorLabel` only if the profile
 * itself is gone (e.g. the account was deleted outright). */
export function jurorDisplayName(
  jurorId: Id,
  assignedJurors: Profile[],
  allProfiles: Profile[],
  formerJurorLabel: string,
): string {
  const found = assignedJurors.find((j) => j.id === jurorId) ?? allProfiles.find((j) => j.id === jurorId)
  return found?.displayName ?? formerJurorLabel
}

/** A locale-aware 3-decimal formatter for finals/averages, matching the live ranking's
 * display (`LiveRanking`). Renders `null` as an em dash. */
export function useScoreFormat() {
  const { i18n } = useTranslation()
  const format = useMemo(
    () => new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
    [i18n.language],
  )
  return (value: number | null) => (value === null ? '—' : format.format(value))
}

export interface TieGroup {
  rank: number
  teamIds: Id[]
}

/** Every rank in the top 3 that's still an unresolved tie (per `rankTeams`' `tieUnresolved`,
 * which only ever flags rank <= 3), each with every team sharing it, in the ranking's
 * current relative order. This is the exact set the manual tie-break UI reorders 1..k at
 * once, so the organizer never leaves a partial order behind. */
export function unresolvedTieGroups(ranked: RankedTeam[]): TieGroup[] {
  const groups: TieGroup[] = []
  const seenRanks = new Set<number>()
  for (const entry of ranked) {
    if (!entry.tieUnresolved || entry.rank === null || seenRanks.has(entry.rank)) continue
    seenRanks.add(entry.rank)
    groups.push({
      rank: entry.rank,
      teamIds: ranked.filter((other) => other.rank === entry.rank).map((other) => other.teamId),
    })
  }
  return groups.sort((a, b) => a.rank - b.rank)
}

/** Resolves a tie group's team ids to the actual teams (in that order), for the manual
 * tie-break dialog's `teams` prop. Skips any id not found in `teamsById` rather than
 * throwing -- it shouldn't happen, but a dropped row is safer than a crash. */
export function resolveTeams(ids: Id[], teamsById: Map<Id, TeamWithProject>): TeamWithProject[] {
  return ids.flatMap((id) => {
    const team = teamsById.get(id)
    return team ? [team] : []
  })
}
