import { Users } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import type { JurorStat } from '@/domain/analytics'
import type { Criterion, Id } from '@/domain/types'
import type { TeamWithProject } from '@/features/teams/api'
import { useProfiles } from '@/features/users/api'
import type { Profile } from '@/stores/session'
import { jurorDisplayName, useScoreFormat } from './reportUtils'
import { ReportPage } from './ReportPage'
import { useEventResults } from './useEventResults'

const TENDENCY_TONE: Record<JurorStat['tendency'], BadgeTone> = {
  lenient: 'warning',
  harsh: 'danger',
  neutral: 'neutral',
}

export interface JurorReportViewProps {
  stats: JurorStat[]
  assignedJurors: Profile[]
  allProfiles: Profile[]
  teams: TeamWithProject[]
  criteria: Criterion[]
}

/** Per-juror mean, spread and lenient/harsh tendency, plus the outlier cells that drove it
 * (a juror scoring far from the rest of the jury on one team+criterion). Covers every
 * juror who scored in this event, including one no longer assigned (see
 * `jurorDisplayName`). Pure/presentational, like the other report views. */
export function JurorReportView({
  stats,
  assignedJurors,
  allProfiles,
  teams,
  criteria,
}: JurorReportViewProps) {
  const { t } = useTranslation()
  const format = useScoreFormat()
  const teamsById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams])
  const criteriaById = useMemo(() => new Map(criteria.map((criterion) => [criterion.id, criterion])), [
    criteria,
  ])
  const nameOf = (jurorId: Id) =>
    jurorDisplayName(jurorId, assignedJurors, allProfiles, t('reports.formerJuror'))

  if (stats.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title={t('reports.jurorsPage.emptyTitle')}
        description={t('reports.jurorsPage.emptyBody')}
      />
    )
  }

  const hasOutliers = stats.some((stat) => stat.outliers.length > 0)

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="-mx-5 overflow-x-auto px-5 py-5">
          <table className="ruled w-full min-w-max border-separate border-spacing-0 text-[0.95rem]">
            <caption className="sr-only">{t('reports.jurorsPage.tableCaption')}</caption>
            <thead>
              <tr className="text-left text-ink-muted">
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('reports.jurorsPage.jurorHeader')}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t('reports.jurorsPage.countHeader')}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t('reports.jurorsPage.meanHeader')}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t('reports.jurorsPage.spreadHeader')}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('reports.jurorsPage.tendencyHeader')}
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.map((stat) => (
                <tr key={stat.jurorId} className="border-t border-line">
                  <th scope="row" className="px-3 py-2 text-left font-medium whitespace-nowrap">
                    {nameOf(stat.jurorId)}
                  </th>
                  <td className="numeral px-3 py-2 text-right">{stat.count}</td>
                  <td className="numeral px-3 py-2 text-right">{format(stat.mean)}</td>
                  <td className="numeral px-3 py-2 text-right">{format(stat.spread)}</td>
                  <td className="px-3 py-2">
                    <Badge tone={TENDENCY_TONE[stat.tendency]}>
                      {t(`reports.jurorsPage.tendency.${stat.tendency}`)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('reports.jurorsPage.outliersHeading')}</CardTitle>
        </CardHeader>
        <CardBody>
          {!hasOutliers ? (
            <p className="text-sm text-ink-faint">{t('reports.jurorsPage.outliersEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {stats.flatMap((stat) =>
                stat.outliers.map((outlier, index) => (
                  <li key={`${stat.jurorId}-${index}`} className="rounded-control bg-raised px-3 py-2">
                    {t('reports.jurorsPage.outlierRow', {
                      juror: nameOf(stat.jurorId),
                      team: teamsById.get(outlier.teamId)?.name ?? outlier.teamId,
                      criterion: criteriaById.get(outlier.criterionId)?.name ?? outlier.criterionId,
                      value: format(outlier.value),
                      othersMean: format(outlier.othersMean),
                    })}
                  </li>
                )),
              )}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

export function JurorReportPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const { t } = useTranslation()
  const id = eventId as Id
  const results = useEventResults(id)
  const { data: allProfiles } = useProfiles()

  return (
    <ReportPage eventId={id} title={t('reports.jurors')} loading={results.isLoading}>
      <JurorReportView
        stats={results.jurorStats}
        assignedJurors={results.jurors}
        allProfiles={allProfiles ?? []}
        teams={results.teams}
        criteria={results.criteria}
      />
    </ReportPage>
  )
}
