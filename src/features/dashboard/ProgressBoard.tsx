import { ClipboardList } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Criterion, Score } from '@/domain/types'
import type { TeamWithProject } from '@/features/teams/api'
import type { Profile } from '@/stores/session'

type CellState = 'empty' | 'partial' | 'complete'

const CELL_TONE: Record<CellState, BadgeTone> = {
  empty: 'neutral',
  partial: 'accent',
  complete: 'success',
}

function cellState(done: number, total: number): CellState {
  if (done <= 0) return 'empty'
  return done >= total ? 'complete' : 'partial'
}

type ProgressBoardProps = {
  teams: TeamWithProject[]
  criteria: Criterion[]
  /** Currently assigned jurors (useEventJurors) -- the grid's rows. A juror removed from
   * the event mid-way has no row here, but their past scores still count in the ranking
   * (the Mirela -> Ovidia swap); `formerJurorsNote` below calls that out instead of adding
   * a row for someone no longer on the jury. */
  jurors: Profile[]
  scores: Score[]
}

/** Jurors x teams completion grid: each cell is how many of this event's criteria that
 * juror has scored for that team. No-show teams are greyed out -- they're excluded from
 * scoring entirely (their final is fixed, see `computeTeamResult`). */
export function ProgressBoard({ teams, criteria, jurors, scores }: ProgressBoardProps) {
  const { t } = useTranslation()
  const total = criteria.length

  const counts = useMemo(() => {
    const criterionIds = new Set(criteria.map((criterion) => criterion.id))
    const map = new Map<string, number>()
    for (const score of scores) {
      if (!criterionIds.has(score.criterionId)) continue
      const key = `${score.jurorId}:${score.teamId}`
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [scores, criteria])

  const formerJurorCount = useMemo(() => {
    const assigned = new Set(jurors.map((juror) => juror.id))
    const former = new Set(
      scores.filter((score) => !assigned.has(score.jurorId)).map((score) => score.jurorId),
    )
    return former.size
  }, [scores, jurors])

  if (teams.length === 0 || criteria.length === 0 || jurors.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title={t('dashboard.progress.emptyTitle')}
        description={t('dashboard.progress.emptyBody')}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
          <caption className="sr-only">{t('dashboard.progress.tableCaption')}</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-medium text-ink-muted"
              >
                {t('dashboard.progress.jurorHeader')}
              </th>
              {teams.map((team) => (
                <th
                  key={team.id}
                  scope="col"
                  className="px-3 py-2 text-left align-bottom font-medium whitespace-nowrap text-ink-muted"
                >
                  <span className={team.noShow ? 'text-ink-faint line-through' : undefined}>
                    {team.name}
                  </span>
                  {team.noShow && (
                    <Badge className="ml-1.5 align-middle">{t('teams.noShowBadge')}</Badge>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jurors.map((juror) => (
              <tr key={juror.id}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-medium whitespace-nowrap"
                >
                  {juror.displayName}
                </th>
                {teams.map((team) => {
                  if (team.noShow) {
                    return (
                      <td key={team.id} className="px-3 py-2 opacity-50">
                        <Badge tone="neutral" aria-label={t('teams.noShowBadge')}>
                          {'—'}
                        </Badge>
                      </td>
                    )
                  }
                  const done = counts.get(`${juror.id}:${team.id}`) ?? 0
                  const state = cellState(done, total)
                  return (
                    <td key={team.id} className="px-3 py-2">
                      <Badge
                        tone={CELL_TONE[state]}
                        aria-label={t('dashboard.progress.cellLabel', {
                          juror: juror.displayName,
                          team: team.name,
                          done,
                          total,
                        })}
                      >
                        {t('dashboard.progress.cell', { done, total })}
                      </Badge>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {formerJurorCount > 0 && (
        <p className="text-sm text-ink-faint">
          {t('dashboard.progress.formerJurorsNote', { count: formerJurorCount })}
        </p>
      )}
    </div>
  )
}
