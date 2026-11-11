import { Trophy } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import type { RankedTeam } from '@/domain/scoring'
import type { Id } from '@/domain/types'
import { useThemes } from '@/features/criteria/api'
import { ExportMenu } from '@/features/export/ExportMenu'
import type { TeamWithProject } from '@/features/teams/api'
import { resolveTeams, useScoreFormat } from './reportUtils'
import { ReportPage } from './ReportPage'
import { TieBreakDialog } from './TieBreakDialog'
import { TieWarning } from './TieWarning'
import { useEventResults } from './useEventResults'
import { useTieBreak } from './useTieBreak'

export interface RankingViewProps {
  eventId: Id
  ranked: RankedTeam[]
  teams: TeamWithProject[]
  themeNames: Map<Id, string>
}

/** The full ranking: every team, its rank, project, theme and final score, with tie and
 * status badges, and a link through to each team's breakdown. Pure/presentational, like
 * `PodiumView`, so fixture/synthetic data can render it directly in tests. */
export function RankingView({ eventId, ranked, teams, themeNames }: RankingViewProps) {
  const { t } = useTranslation()
  const format = useScoreFormat()
  const teamsById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams])
  const { tieGroups, activeTieGroup, openTieBreak, closeTieBreak } = useTieBreak(ranked)

  if (ranked.length === 0) {
    return (
      <EmptyState
        icon={Trophy}
        title={t('dashboard.ranking.emptyTitle')}
        description={t('dashboard.ranking.emptyBody')}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <TieWarning tieGroups={tieGroups} onResolve={openTieBreak} />

      <Card>
        <div className="-mx-5 overflow-x-auto px-5 py-5">
          <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
            <caption className="sr-only">{t('reports.rankingPage.tableCaption')}</caption>
            <thead>
              <tr className="text-left text-ink-muted">
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('reports.rankingPage.rankHeader')}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('reports.rankingPage.teamHeader')}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('reports.rankingPage.projectHeader')}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('reports.rankingPage.themeHeader')}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t('reports.rankingPage.finalHeader')}
                </th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((entry) => {
                const team = teamsById.get(entry.teamId)
                const notScored = entry.final === null && !team?.noShow
                const themeName = team?.project.themeId ? themeNames.get(team.project.themeId) : undefined
                return (
                  <tr key={entry.teamId} className="border-t border-line">
                    <td className="numeral px-3 py-2.5 text-lg">{entry.rank ?? '–'}</td>
                    <td className="px-3 py-2.5">
                      <Link
                        to={`/admin/events/${eventId}/reports/teams/${entry.teamId}`}
                        className="font-semibold underline-offset-2 hover:underline"
                      >
                        {team?.name ?? entry.teamId}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {team?.noShow && <Badge>{t('teams.noShowBadge')}</Badge>}
                        {notScored && <Badge tone="warning">{t('dashboard.ranking.notScoredBadge')}</Badge>}
                        {entry.tiedWith.length > 0 && (
                          <Badge tone="gold">{t('dashboard.ranking.tieBadge')}</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-ink-muted">
                      {team?.project.name ?? t('teams.noProject')}
                    </td>
                    <td className="px-3 py-2.5 text-ink-muted">{themeName ?? '—'}</td>
                    <td className="numeral px-3 py-2.5 text-right text-base">{format(entry.final)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {activeTieGroup && (
        <TieBreakDialog
          eventId={eventId}
          open
          onOpenChange={(open) => !open && closeTieBreak()}
          teams={resolveTeams(activeTieGroup.teamIds, teamsById)}
        />
      )}
    </div>
  )
}

export function RankingPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const { t } = useTranslation()
  const id = eventId as Id
  const results = useEventResults(id)
  const { data: themes } = useThemes(id)
  const themeNames = useMemo(
    () => new Map((themes ?? []).map((theme) => [theme.id, theme.name])),
    [themes],
  )

  return (
    <ReportPage
      eventId={id}
      title={t('reports.ranking')}
      loading={results.isLoading}
      actions={<ExportMenu eventId={id} />}
    >
      <RankingView eventId={id} ranked={results.ranked} teams={results.teams} themeNames={themeNames} />
    </ReportPage>
  )
}
