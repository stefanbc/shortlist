import { ChartNoAxesColumn } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import type { CriterionStat } from '@/domain/analytics'
import type { Criterion, Id } from '@/domain/types'
import { useScoreFormat } from './reportUtils'
import { CriterionBars } from './CriterionBars'
import { ReportPage } from './ReportPage'
import { useEventResults } from './useEventResults'

export interface CriteriaReportViewProps {
  criteria: Criterion[]
  stats: CriterionStat[]
}

/** Which criteria separated teams: a mean + spread table (sorted most-discriminating
 * first by `criterionStats`) and a bar chart of field-wide averages. Pure/presentational,
 * like the other report views, for fixture/synthetic testing. */
export function CriteriaReportView({ criteria, stats }: CriteriaReportViewProps) {
  const { t } = useTranslation()
  const format = useScoreFormat()
  const criteriaById = new Map(criteria.map((criterion) => [criterion.id, criterion]))

  // `criterionStats` always returns one entry per criterion -- it's never actually []
  // once criteria exist, even before anyone has scored (each entry's mean is just null
  // until then). So the empty state has to key off "nothing has a score yet", not
  // "there are no stat rows" (which only happens when there are no criteria at all).
  if (stats.every((stat) => stat.mean === null)) {
    return (
      <EmptyState
        icon={ChartNoAxesColumn}
        title={t('reports.criteriaPage.emptyTitle')}
        description={t('reports.criteriaPage.emptyBody')}
      />
    )
  }

  const chartData = stats
    .filter((stat): stat is CriterionStat & { mean: number } => stat.mean !== null)
    .map((stat) => ({
      name: criteriaById.get(stat.criterionId)?.name ?? stat.criterionId,
      mean: stat.mean,
    }))

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden">
        <div className="table-scroll">
          <table className="ruled w-full min-w-max border-separate border-spacing-0 text-[0.95rem]">
            <caption className="sr-only">{t('reports.criteriaPage.tableCaption')}</caption>
            <thead>
              <tr className="text-left text-ink-muted">
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('criteria.nameLabel')}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t('criteria.weightLabel')}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t('reports.criteriaPage.meanHeader')}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t('reports.criteriaPage.spreadHeader')}
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.map((stat) => {
                const criterion = criteriaById.get(stat.criterionId)
                return (
                  <tr key={stat.criterionId} className="border-t border-line">
                    <th scope="row" className="px-3 py-2 text-left font-medium">
                      {criterion?.name ?? stat.criterionId}
                    </th>
                    <td className="numeral px-3 py-2 text-right text-ink-muted">
                      {criterion?.weight ?? '—'}
                    </td>
                    <td className="numeral px-3 py-2 text-right">{format(stat.mean)}</td>
                    <td className="numeral px-3 py-2 text-right">{format(stat.spread)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('reports.criteriaPage.chartTitle')}</CardTitle>
        </CardHeader>
        <CardBody>
          <CriterionBars
            data={chartData.map((row) => ({ name: row.name, value: row.mean }))}
            format={format}
          />
        </CardBody>
      </Card>
    </div>
  )
}

export function CriteriaReportPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const { t } = useTranslation()
  const id = eventId as Id
  const results = useEventResults(id)

  return (
    <ReportPage eventId={id} title={t('reports.criteria')} loading={results.isLoading}>
      <CriteriaReportView criteria={results.criteria} stats={results.criterionStats} />
    </ReportPage>
  )
}
