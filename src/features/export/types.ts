import type { RankedTeam } from '@/domain/scoring'
import type { Criterion, Id, Score } from '@/domain/types'
import type { Theme } from '@/features/criteria/api'
import type { EventResults } from '@/features/reports/useEventResults'
import type { TeamWithProject } from '@/features/teams/api'
import type { Profile } from '@/stores/session'

/** Everything the three export formats (CSV, Excel, PDF) read from: the current ranking
 * plus enough context (event name, theme names, every juror who ever scored -- including
 * one later removed from the event) to render a report standalone. */
export interface ExportData {
  eventName: string
  themes: string[]
  criteria: Criterion[]
  teams: TeamWithProject[]
  themeNames: Record<Id, string>
  jurors: Profile[]
  scores: Score[]
  ranked: RankedTeam[]
}

/** Assembles `ExportData` from `useEventResults`' output plus the event name and themes.
 * `jurors` lists every juror who has a score in the event: currently assigned jurors
 * first, then any juror no longer assigned (a juror replaced mid-event) resolved from
 * `allProfiles`, falling back to `formerJurorLabel` if even the profile is gone --
 * the same resolution `TeamBreakdownPage` uses for its per-team juror columns. */
export function buildExportData(args: {
  eventName: string
  themes: Theme[]
  results: Pick<EventResults, 'criteria' | 'teams' | 'jurors' | 'scores' | 'ranked'>
  allProfiles: Profile[]
  formerJurorLabel: string
}): ExportData {
  const { eventName, themes, results, allProfiles, formerJurorLabel } = args

  const scoredJurorIds = Array.from(new Set(results.scores.map((score) => score.jurorId)))
  const assignedIds = new Set(results.jurors.map((juror) => juror.id))
  const formerJurors: Profile[] = scoredJurorIds
    .filter((id) => !assignedIds.has(id))
    .map((id) => {
      const found = allProfiles.find((profile) => profile.id === id)
      return (
        found ?? {
          id,
          displayName: formerJurorLabel,
          email: null,
          role: 'juror',
          active: false,
        }
      )
    })

  const themeNames: Record<Id, string> = Object.fromEntries(
    themes.map((theme) => [theme.id, theme.name]),
  )

  return {
    eventName,
    themes: themes.map((theme) => theme.name),
    criteria: results.criteria,
    teams: results.teams,
    themeNames,
    jurors: [...results.jurors, ...formerJurors],
    scores: results.scores,
    ranked: results.ranked,
  }
}
