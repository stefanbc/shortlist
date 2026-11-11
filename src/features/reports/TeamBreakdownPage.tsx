import { ArrowLeft, FileQuestion } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link, useParams } from 'react-router'
import { Page, PageHeader } from '@/components/layout/Page'
import { Badge } from '@/components/ui/Badge'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import type { RankedTeam } from '@/domain/scoring'
import type { Criterion, Id, Score } from '@/domain/types'
import { useThemes } from '@/features/criteria/api'
import type { TeamWithProject } from '@/features/teams/api'
import { useProfiles } from '@/features/users/api'
import type { Profile } from '@/stores/session'
import { jurorDisplayName, useScoreFormat } from './reportUtils'
import { useEventResults } from './useEventResults'

export interface TeamBreakdownViewProps {
  team: TeamWithProject
  entry: RankedTeam | undefined
  criteria: Criterion[]
  scores: Score[]
  assignedJurors: Profile[]
  allProfiles: Profile[]
  themeName: string | null
}

/** Sheet-style grid for one team: criteria x jurors, with weight/average/weighted columns
 * and a juror-average footer row, matching the source spreadsheet's layout, plus a bar
 * chart of criterion averages. Pure/presentational so fixture or hand-built data can
 * render it directly in tests. Juror columns cover every juror who scored this team,
 * including one no longer assigned to the event (resolved via `allProfiles`, or labelled
 * "Former juror" if even the profile is gone). */
export function TeamBreakdownView({
  team,
  entry,
  criteria,
  scores,
  assignedJurors,
  allProfiles,
  themeName,
}: TeamBreakdownViewProps) {
  const { t } = useTranslation()
  const format = useScoreFormat()

  const teamScores = useMemo(() => scores.filter((score) => score.teamId === team.id), [scores, team.id])

  const jurorIds = useMemo(() => {
    const scoredIds = Array.from(new Set(teamScores.map((score) => score.jurorId)))
    const assignedIds = new Set(assignedJurors.map((juror) => juror.id))
    return [
      ...assignedJurors.filter((juror) => scoredIds.includes(juror.id)).map((juror) => juror.id),
      ...scoredIds.filter((id) => !assignedIds.has(id)),
    ]
  }, [teamScores, assignedJurors])

  const jurorNames = useMemo(
    () =>
      new Map(
        jurorIds.map((id) => [
          id,
          jurorDisplayName(id, assignedJurors, allProfiles, t('reports.formerJuror')),
        ]),
      ),
    [jurorIds, assignedJurors, allProfiles, t],
  )

  function valueAt(criterionId: Id, jurorId: Id): number | null {
    return teamScores.find((s) => s.criterionId === criterionId && s.jurorId === jurorId)?.value ?? null
  }

  function criterionResult(criterionId: Id) {
    return entry?.criteria.find((c) => c.criterionId === criterionId)
  }

  function jurorAverage(jurorId: Id): number | null {
    return entry?.jurors.find((j) => j.jurorId === jurorId)?.average ?? null
  }

  const chartData = criteria
    .map((criterion) => ({ name: criterion.name, average: criterionResult(criterion.id)?.average ?? null }))
    .filter((point): point is { name: string; average: number } => point.average !== null)

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{team.project.name ?? t('teams.noProject')}</CardTitle>
          {themeName && <Badge tone="accent">{themeName}</Badge>}
        </CardHeader>
        <CardBody className="flex flex-wrap items-center gap-4">
          <div>
            <p className="text-sm text-ink-faint">{t('reports.teamPage.finalLabel')}</p>
            <p className="numeral text-3xl">{format(entry?.final ?? null)}</p>
          </div>
          {typeof entry?.rank === 'number' && (
            <Badge tone="gold">{t('reports.teamPage.rankBadge', { rank: entry.rank })}</Badge>
          )}
          {team.noShow && <Badge>{t('teams.noShowBadge')}</Badge>}
        </CardBody>
      </Card>

      {team.noShow ? (
        <EmptyState
          icon={FileQuestion}
          title={t('reports.teamPage.noShowTitle')}
          description={t('reports.teamPage.noShowBody')}
        />
      ) : (
        <>
          <Card>
            <div className="-mx-5 overflow-x-auto px-5 py-5">
              <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
                <caption className="sr-only">
                  {t('reports.teamPage.tableCaption', { team: team.name })}
                </caption>
                <thead>
                  <tr className="text-left text-ink-muted">
                    <th scope="col" className="sticky left-0 z-10 bg-surface px-3 py-2 font-medium">
                      {t('criteria.nameLabel')}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      {t('criteria.weightLabel')}
                    </th>
                    {jurorIds.map((id) => (
                      <th
                        key={id}
                        scope="col"
                        className="px-3 py-2 text-right font-medium whitespace-nowrap"
                      >
                        {jurorNames.get(id)}
                      </th>
                    ))}
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      {t('reports.teamPage.averageLabel')}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      {t('reports.teamPage.weightedLabel')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {criteria.map((criterion) => {
                    const result = criterionResult(criterion.id)
                    return (
                      <tr key={criterion.id} className="border-t border-line">
                        <th
                          scope="row"
                          className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-medium"
                        >
                          {criterion.name}
                        </th>
                        <td className="numeral px-3 py-2 text-right text-ink-muted">{criterion.weight}</td>
                        {jurorIds.map((id) => (
                          <td key={id} className="numeral px-3 py-2 text-right">
                            {valueAt(criterion.id, id) ?? '—'}
                          </td>
                        ))}
                        <td className="numeral px-3 py-2 text-right">{format(result?.average ?? null)}</td>
                        <td className="numeral px-3 py-2 text-right font-semibold">
                          {format(result?.weighted ?? null)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line-strong">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-semibold"
                    >
                      {t('reports.teamPage.jurorAverageRow')}
                    </th>
                    <td className="px-3 py-2" />
                    {jurorIds.map((id) => (
                      <td key={id} className="numeral px-3 py-2 text-right">
                        {format(jurorAverage(id))}
                      </td>
                    ))}
                    <td className="px-3 py-2" />
                    <td className="numeral px-3 py-2 text-right font-bold">
                      {format(entry?.final ?? null)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('reports.teamPage.chartTitle')}</CardTitle>
            </CardHeader>
            <CardBody>
              {chartData.length === 0 ? (
                <p className="text-sm text-ink-faint">{t('reports.teamPage.chartEmpty')}</p>
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ left: 0, right: 12, top: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: 'var(--ink-muted)', fontSize: 12 }}
                        tickLine={false}
                        axisLine={{ stroke: 'var(--line)' }}
                        interval={0}
                        angle={-20}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis
                        domain={[0, 5]}
                        tick={{ fill: 'var(--ink-muted)', fontSize: 12 }}
                        tickLine={false}
                        axisLine={{ stroke: 'var(--line)' }}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--surface)',
                          border: '1px solid var(--line)',
                          borderRadius: 10,
                          color: 'var(--ink)',
                        }}
                        formatter={(value) => format(typeof value === 'number' ? value : null)}
                      />
                      <Bar dataKey="average" fill="var(--accent)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  )
}

export function TeamBreakdownPage() {
  const { eventId, teamId } = useParams<{ eventId: string; teamId: string }>()
  const { t } = useTranslation()
  const id = eventId as Id
  const results = useEventResults(id)
  const { data: themes } = useThemes(id)
  const { data: allProfiles } = useProfiles()

  const team = results.teams.find((candidate) => candidate.id === teamId)
  const entry = results.ranked.find((candidate) => candidate.teamId === teamId)
  const themeName = team?.project.themeId
    ? ((themes ?? []).find((theme) => theme.id === team.project.themeId)?.name ?? null)
    : null

  const backLink = (
    <Link
      to={`/admin/events/${id}/reports/ranking`}
      className={buttonClasses({ variant: 'secondary', size: 'sm' })}
    >
      <ArrowLeft aria-hidden />
      {t('reports.teamPage.backToRanking')}
    </Link>
  )

  if (results.isLoading) {
    return (
      <Page>
        <PageHeader title={<Skeleton className="h-9 w-56" />} />
        <Skeleton className="h-64 w-full" />
      </Page>
    )
  }

  if (!team) {
    return (
      <Page>
        <PageHeader title={t('reports.team')} actions={backLink} />
        <EmptyState
          icon={FileQuestion}
          title={t('reports.teamPage.notFoundTitle')}
          description={t('reports.teamPage.notFoundBody')}
        />
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader title={team.name} description={t('reports.team')} actions={backLink} />
      <TeamBreakdownView
        team={team}
        entry={entry}
        criteria={results.criteria}
        scores={results.scores}
        assignedJurors={results.jurors}
        allProfiles={allProfiles ?? []}
        themeName={themeName}
      />
    </Page>
  )
}
