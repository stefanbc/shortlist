import { CalendarClock, ChevronRight, Mic, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Page, PageHeader } from '@/components/layout/Page'
import { Badge } from '@/components/ui/Badge'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import type { Criterion } from '@/domain/types'
import { useCriteria, useThemes } from '@/features/criteria/api'
import { useActiveEvent, useEvent, useEvents, useEventUpdates } from '@/features/events/api'
import { EventPhaseBadge } from '@/features/events/EventPhaseBadge'
import { useJurorTeams, type TeamWithProject } from '@/features/teams/api'
import { cn } from '@/lib/cn'
import { useNow } from '@/lib/useNow'
import { useMyCellSync, useMyScores, useScoreSync, type CellSync } from './api'
import { cellViews, countScored } from './cells'
import { NowPitchingDialog } from './NowPitchingDialog'
import { RejectedNotice, SyncIndicator } from './SyncStatus'

/** The juror's start screen: their active event's teams in pitch order, each with how far
 * the juror has got, and the team on stage highlighted. */
export function JurorHomePage() {
  const { t } = useTranslation()
  const events = useEvents()
  const active = useActiveEvent()
  const eventId = active?.id ?? ''
  useEventUpdates(eventId)
  // The single-event query is the one Realtime writes into; fall back to the list row.
  const { data: live } = useEvent(eventId)
  const event = live ?? active ?? undefined
  const now = useNow(30_000)

  if (events.isLoading) {
    return (
      <Page className="max-w-3xl">
        <span className="sr-only" role="status">
          {t('common.loading')}
        </span>
        <Skeleton className="h-9 w-48" />
        <div className="mt-8 flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-card" />
          ))}
        </div>
      </Page>
    )
  }

  if (!event) {
    return (
      <Page className="max-w-3xl">
        <PageHeader title={t('scoring.title')} />
        <EmptyState
          icon={CalendarClock}
          title={t('scoring.noEventTitle')}
          description={t('scoring.noEventBody')}
        />
      </Page>
    )
  }

  return (
    <Page className="max-w-3xl">
      <PageHeader
        title={t('scoring.title')}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink">{event.name}</span>
            <EventPhaseBadge event={event} now={now} />
          </span>
        }
      />
      <TeamOverview eventId={event.id} nowPitchingTeamId={event.nowPitchingTeamId} />
    </Page>
  )
}

function TeamOverview({
  eventId,
  nowPitchingTeamId,
}: {
  eventId: string
  nowPitchingTeamId: string | null
}) {
  const { t } = useTranslation()
  const { data: teams } = useJurorTeams(eventId)
  const { data: criteria } = useCriteria(eventId)
  const { data: themes } = useThemes(eventId)
  const { data: event } = useEvent(eventId)
  const scores = useMyScores(eventId)
  const cellSync = useMyCellSync(eventId)
  const sync = useScoreSync(eventId)

  if (!teams || !criteria) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-card" />
        ))}
      </div>
    )
  }

  if (teams.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title={t('scoring.noTeamsTitle')}
        description={t('scoring.noTeamsBody', { event: event?.name ?? '' })}
      />
    )
  }

  const onStage = teams.find((team) => team.id === nowPitchingTeamId)
  const themeName = (team: TeamWithProject) =>
    themes?.find((theme) => theme.id === team.project.themeId)?.name

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-ink-muted">{t('scoring.homeHint')}</p>
        <SyncIndicator {...sync} />
      </div>

      <RejectedNotice cells={cellSync} />

      {onStage && !onStage.noShow && (
        <section className="flex flex-col gap-4 rounded-panel bg-gold-soft p-5 ring-1 ring-gold/30 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <Badge tone="gold" dot="live" className="bg-surface/60">
              {t('scoring.nowPitching')}
            </Badge>
            <p className="mt-2 text-2xl font-bold break-words">{onStage.name}</p>
            {onStage.project.name && <p className="text-ink-muted">{onStage.project.name}</p>}
          </div>
          <Link
            to={`/score/${eventId}/${onStage.id}`}
            className={buttonClasses({ size: 'lg', className: 'w-full sm:w-auto' })}
          >
            <Mic aria-hidden />
            {t('scoring.openNowPitching', { team: onStage.name })}
          </Link>
        </section>
      )}

      <ol aria-label={t('scoring.title')} className="flex flex-col gap-2">
        {teams.map((team, index) => (
          <li key={team.id}>
            <TeamRow
              eventId={eventId}
              team={team}
              position={index + 1}
              theme={themeName(team)}
              criteria={criteria}
              scores={scores}
              cellSync={cellSync}
              onStage={team.id === nowPitchingTeamId}
            />
          </li>
        ))}
      </ol>
      {event && <NowPitchingDialog event={event} teams={teams} currentTeamId={null} />}
    </div>
  )
}

type TeamRowProps = {
  eventId: string
  team: TeamWithProject
  position: number
  theme: string | undefined
  criteria: Criterion[]
  scores: Record<string, number>
  cellSync: Record<string, CellSync>
  onStage: boolean
}

function TeamRow({
  eventId,
  team,
  position,
  theme,
  criteria,
  scores,
  cellSync,
  onStage,
}: TeamRowProps) {
  const { t } = useTranslation()
  const cells = cellViews(team.id, criteria, scores, cellSync)
  const scored = countScored(cells)
  const notSaved = cells.filter((cell) => cell.state === 'rejected').length
  const total = criteria.length

  const status = team.noShow ? (
    <Badge>{t('scoring.status.noShow')}</Badge>
  ) : scored === 0 ? (
    <Badge>{t('scoring.status.notStarted')}</Badge>
  ) : scored >= total ? (
    <Badge tone="success">{t('scoring.status.complete')}</Badge>
  ) : (
    <Badge tone="accent">{t('scoring.status.inProgress', { done: scored, total })}</Badge>
  )

  return (
    <Link
      to={`/score/${eventId}/${team.id}`}
      className={cn(
        'group flex min-h-18 items-center gap-4 rounded-card bg-surface px-4 py-3 ring-1 ring-line transition-shadow duration-(--duration-fast) hover:ring-line-strong',
        onStage && 'ring-2 ring-gold hover:ring-gold',
        team.noShow && 'bg-transparent',
      )}
    >
      <span
        className={cn(
          'numeral w-9 shrink-0 text-right text-3xl leading-none',
          onStage ? 'text-gold' : 'text-ink-faint',
        )}
      >
        {position}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block font-semibold break-words',
            team.noShow && 'text-ink-muted line-through',
          )}
        >
          {team.name}
        </span>
        {(team.project.name || theme) && (
          <span className="mt-0.5 flex flex-wrap gap-x-2 text-sm text-ink-muted">
            {team.project.name && <span>{team.project.name}</span>}
            {theme && <span className="text-ink-faint">{theme}</span>}
          </span>
        )}
        <span className="mt-2 flex flex-wrap gap-1.5">
          {onStage && (
            <Badge tone="gold" dot="live">
              {t('scoring.nowPitching')}
            </Badge>
          )}
          {status}
          {notSaved > 0 && (
            <Badge tone="danger">{t('scoring.status.notSaved', { count: notSaved })}</Badge>
          )}
        </span>
      </span>
      <ChevronRight
        aria-hidden
        className="size-5 shrink-0 text-ink-faint transition-transform duration-(--duration-fast) group-hover:translate-x-0.5"
      />
    </Link>
  )
}
