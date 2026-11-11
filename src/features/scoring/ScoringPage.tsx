import { ChevronLeft, ListChecks, SearchX } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { Page } from '@/components/layout/Page'
import { Badge } from '@/components/ui/Badge'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { eventPhase } from '@/domain/eventPhase'
import type { Criterion } from '@/domain/types'
import { useCriteria, useThemes } from '@/features/criteria/api'
import { useEvent, useEventUpdates, type EventRow } from '@/features/events/api'
import { useJurorTeams, type TeamWithProject } from '@/features/teams/api'
import { cn } from '@/lib/cn'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useNow } from '@/lib/useNow'
import { queueId, scoreKey, useScoreQueue } from '@/stores/scoreQueue'
import { useSession } from '@/stores/session'
import { useMyCellSync, useMySavedScores, useMyScores, useScoreSync } from './api'
import { cellViews, countScored, firstUnsaved, type CellView } from './cells'
import { CriterionCard } from './CriterionCard'
import { CriterionList } from './CriterionList'
import { CriterionStrip } from './CriterionStrip'
import { NowPitchingDialog } from './NowPitchingDialog'
import { PitchTimer } from './PitchTimer'
import { RejectedNotice, SyncIndicator } from './SyncStatus'
import { TeamNote } from './TeamNote'
import { useScoringKeys } from './useScoringKeys'

/** Pause after a tap so the juror sees the value land before the card moves on. */
export const AUTO_ADVANCE_MS = 250

/** Phones get the strip + swipe card; wider screens the list beside the card. */
export const WIDE_QUERY = '(min-width: 768px)'

export function ScoringPage() {
  const { t } = useTranslation()
  const { eventId = '', teamId = '' } = useParams()
  useEventUpdates(eventId)
  const { data: event } = useEvent(eventId)
  const { data: teams } = useJurorTeams(eventId)
  const { data: criteria } = useCriteria(eventId)

  if (!event || !teams || !criteria) {
    return (
      <Page className="max-w-5xl">
        <span className="sr-only" role="status">
          {t('scoring.loading')}
        </span>
        <Skeleton className="h-11 w-32" />
        <Skeleton className="mt-6 h-9 w-56" />
        <Skeleton className="mt-6 h-96 w-full rounded-panel" />
      </Page>
    )
  }

  const position = teams.findIndex((candidate) => candidate.id === teamId)
  if (position < 0) {
    return (
      <Page className="max-w-5xl">
        <EmptyState
          icon={SearchX}
          title={t('scoring.teamNotFoundTitle')}
          description={t('scoring.teamNotFoundBody')}
          action={
            <Link to="/score" className={buttonClasses({ variant: 'secondary' })}>
              {t('scoring.backToTeams')}
            </Link>
          }
        />
      </Page>
    )
  }

  if (criteria.length === 0) {
    return (
      <Page className="max-w-5xl">
        <EmptyState
          icon={ListChecks}
          title={t('scoring.noCriteriaTitle')}
          description={t('scoring.noCriteriaBody')}
          action={
            <Link to="/score" className={buttonClasses({ variant: 'secondary' })}>
              {t('scoring.backToTeams')}
            </Link>
          }
        />
      </Page>
    )
  }

  return (
    <>
      <TeamScoring
        key={teamId}
        event={event}
        team={teams[position]}
        position={position + 1}
        teamCount={teams.length}
        criteria={criteria}
      />
      <NowPitchingDialog event={event} teams={teams} currentTeamId={teamId} />
    </>
  )
}

type TeamScoringProps = {
  event: EventRow
  team: TeamWithProject
  /** 1-based position in pitch order (not the raw pitchOrder, which can have gaps). */
  position: number
  teamCount: number
  criteria: Criterion[]
}

function TeamScoring({ event, team, position, teamCount, criteria }: TeamScoringProps) {
  const { t, i18n } = useTranslation()
  const wide = useMediaQuery(WIDE_QUERY)
  const now = useNow(15_000)
  const jurorId = useSession((state) => state.profile?.id)
  const enqueue = useScoreQueue((state) => state.enqueue)
  const discardRejected = useScoreQueue((state) => state.discardRejected)
  const { data: themes } = useThemes(event.id)
  const scores = useMyScores(event.id)
  const saved = useMySavedScores(event.id)
  const sync = useScoreSync(event.id)
  const cellSync = useMyCellSync(event.id)

  const cells = cellViews(team.id, criteria, scores, cellSync, saved.data)
  const scored = countScored(cells)
  const theme = themes?.find((candidate) => candidate.id === team.project.themeId)
  const onStage = event.nowPitchingTeamId === team.id

  const phase = eventPhase(event, now)
  const disabledReason = team.noShow
    ? t('scoring.disabled.noShow')
    : phase === 'setup'
      ? t('scoring.disabled.setup', {
          time: new Intl.DateTimeFormat(i18n.language, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(event.startsAt)),
        })
      : phase === 'locked' && sync.pending === 0
        ? t('scoring.disabled.locked')
        : null
  const disabled = disabledReason !== null

  // Where the juror is: the criterion they picked, else where they left off. The resume
  // point is fixed once, when the saved scores first arrive (a cold load starts before they
  // do), and only matters until the juror moves or scores.
  const [chosen, setChosen] = useState<number | null>(null)
  const [resumeAt, setResumeAt] = useState<number | null>(null)
  if (resumeAt === null && saved.isFetched) setResumeAt(firstUnsaved(cells))
  const index = chosen ?? resumeAt ?? firstUnsaved(cells)
  const [direction, setDirection] = useState(1)
  const current = Math.min(index, criteria.length - 1)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelAdvance = useCallback(() => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    advanceTimer.current = null
  }, [])
  useEffect(() => cancelAdvance, [cancelAdvance])

  function go(target: number) {
    cancelAdvance()
    const next = Math.max(0, Math.min(criteria.length - 1, target))
    if (next === current) return
    setDirection(next > current ? 1 : -1)
    setChosen(next)
  }

  function write(criterionIndex: number, value: number | null) {
    if (disabled || !jurorId) return
    const criterion = criteria[criterionIndex]
    // Scoring pins the juror here: a late resume point must not pull them away.
    if (chosen === null) setChosen(criterionIndex)
    enqueue({ eventId: event.id, teamId: team.id, criterionId: criterion.id, value, jurorId })
  }

  function pick(value: number) {
    const from = current
    write(from, value)
    if (disabled) return
    cancelAdvance()
    advanceTimer.current = setTimeout(() => {
      advanceTimer.current = null
      setDirection(1)
      // Only move on if the juror is still on the criterion they just scored.
      setChosen((at) => {
        const still = at ?? from
        return still === from && from < criteria.length - 1 ? from + 1 : still
      })
    }, AUTO_ADVANCE_MS)
  }

  const currentValue = (cell: CellView) => ('value' in cell ? cell.value : null)

  useScoringKeys({
    onSet: (value) => {
      cancelAdvance()
      write(current, value)
    },
    onHalf: () => {
      const value = currentValue(cells[current])
      if (value === null) return
      const half = Math.min(5, Math.floor(value) + 0.5)
      if (half !== value) write(current, half)
    },
    onClear: () => {
      if (cells[current].state !== 'empty') write(current, null)
    },
    onPrev: () => go(current - 1),
    onNext: () => go(current + 1),
  })

  const nav = { criteria, cells, currentIndex: current, onSelect: go }

  return (
    <Page className="max-w-5xl pt-3 lg:pt-6">
      <div className="flex items-center justify-between gap-3">
        <Link to="/score" className={buttonClasses({ variant: 'ghost', className: '-ml-3' })}>
          <ChevronLeft aria-hidden />
          {t('scoring.backToTeams')}
        </Link>
        <SyncIndicator {...sync} />
      </div>

      <header className="mt-2 mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <span>{t('scoring.teamPosition', { n: position, total: teamCount })}</span>
            {onStage && (
              <Badge tone="gold" dot="live">
                {t('scoring.nowPitching')}
              </Badge>
            )}
            {team.noShow && <Badge>{t('scoring.status.noShow')}</Badge>}
          </div>
          <h1 className="mt-1 text-3xl break-words sm:text-[2.5rem] sm:leading-tight">
            <title>{`${team.name} | Shortlist`}</title>
            {team.name}
          </h1>
          {(team.project.name || theme) && (
            <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-ink-muted">
              {team.project.name && <span>{team.project.name}</span>}
              {theme && <Badge tone="accent">{theme.name}</Badge>}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Progress cells={cells} scored={scored} />
          <PitchTimer
            pitchMinutes={event.pitchMinutes}
            onStageSince={onStage ? event.nowPitchingSince : null}
          />
        </div>
      </header>

      <RejectedNotice cells={cellSync} />

      <div className={cn('mt-4', wide && 'grid grid-cols-[minmax(14rem,18rem)_1fr] gap-8')}>
        {wide ? (
          <aside>
            <CriterionList {...nav} />
          </aside>
        ) : (
          <CriterionStrip {...nav} />
        )}

        <div className={cn('flex flex-col gap-3', !wide && 'mt-3')}>
          <CriterionCard
            criterion={criteria[current]}
            n={current + 1}
            total={criteria.length}
            cell={cells[current]}
            disabledReason={disabledReason}
            swipeable={!wide}
            direction={direction}
            onPick={pick}
            onDiscard={() => {
              if (jurorId) {
                discardRejected(queueId({ jurorId, key: scoreKey(team.id, criteria[current].id) }))
              }
            }}
            onClear={() => {
              cancelAdvance()
              write(current, null)
            }}
            onPrev={() => go(current - 1)}
            onNext={() => go(current + 1)}
          />
          <p className="px-1 text-xs text-ink-faint">
            {wide ? t('scoring.keyHint') : t('scoring.tapHint')}
          </p>
          <TeamNote teamId={team.id} teamName={team.name} />
        </div>
      </div>
    </Page>
  )
}

/** "2/9" with one segment per criterion, coloured by its state. */
function Progress({ cells, scored }: { cells: CellView[]; scored: number }) {
  const { t } = useTranslation()
  return (
    <div
      role="img"
      aria-label={t('scoring.progressLabel', { done: scored, total: cells.length })}
      className="flex items-center gap-2.5"
    >
      <span className="flex gap-0.5">
        {cells.map((cell, i) => (
          <span
            key={i}
            className={cn(
              'h-5 w-1.5 rounded-full bg-line',
              (cell.state === 'saved' || cell.state === 'pending') && 'bg-accent',
              cell.state === 'rejected' && 'bg-danger',
            )}
          />
        ))}
      </span>
      <span className="numeral text-xl">
        {scored}/{cells.length}
      </span>
    </div>
  )
}
