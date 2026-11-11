import { ClipboardList } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Criterion, Score } from '@/domain/types'
import type { TeamWithProject } from '@/features/teams/api'
import { cn } from '@/lib/cn'
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
  /** Currently assigned jurors (useEventJurors) -- the grid's columns. A juror removed from
   * the event mid-way has no column here, but their past scores still count in the ranking
   * (a juror replaced mid-event); `formerJurorsNote` below calls that out instead of adding
   * a column for someone no longer on the jury. */
  jurors: Profile[]
  scores: Score[]
  /** The team on stage, so its row stands out. */
  nowPitchingTeamId?: string | null
}

/** Teams x jurors completion grid: each cell is how many of this event's criteria that
 * juror has scored for that team. No-show teams are greyed out -- they're excluded from
 * scoring entirely (their final is fixed, see `computeTeamResult`). */
export function ProgressBoard({
  teams,
  criteria,
  jurors,
  scores,
  nowPitchingTeamId,
}: ProgressBoardProps) {
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
      {/* Teams run down (there are many), jurors across (there are few), inside a frame
          with its own scroll: the juror names stay on top and the team names on the left. */}
      <div className="table-scroll max-h-[26rem] rounded-control border border-line">
        <table className="ruled w-full min-w-max border-separate border-spacing-0 text-[0.95rem]">
          <caption className="sr-only">{t('dashboard.progress.tableCaption')}</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-20 bg-surface px-3 py-2 text-left font-medium text-ink-muted"
              >
                {t('dashboard.progress.teamHeader')}
              </th>
              {jurors.map((juror) => (
                <th
                  key={juror.id}
                  scope="col"
                  className="px-3 py-2 text-left align-bottom font-medium whitespace-nowrap text-ink-muted"
                >
                  {juror.displayName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((team, index) => (
              <tr key={team.id}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 max-w-[45vw] bg-surface px-3 py-2 text-left font-medium sm:max-w-64"
                >
                  <span className="flex items-baseline gap-2">
                    <span className="w-5 shrink-0 text-right text-sm font-normal text-ink-faint tabular-nums">
                      {index + 1}
                    </span>
                    <span className={cn('min-w-0 truncate', team.noShow && 'text-ink-faint line-through')}>
                      <span className={cn(team.id === nowPitchingTeamId && 'marked-text')}>{team.name}</span>
                    </span>
                    {team.noShow && <Badge className="shrink-0">{t('teams.noShowBadge')}</Badge>}
                  </span>
                </th>
                {jurors.map((juror) => {
                  if (team.noShow) {
                    return (
                      <td key={juror.id} className="px-3 py-2 opacity-50">
                        <Badge tone="neutral" aria-label={t('teams.noShowBadge')}>
                          {'—'}
                        </Badge>
                      </td>
                    )
                  }
                  const done = counts.get(`${juror.id}:${team.id}`) ?? 0
                  const state = cellState(done, total)
                  return (
                    <td key={juror.id} className="px-3 py-2">
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
