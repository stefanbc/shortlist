import { CalendarRange, SkipForward } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import type { Id } from '@/domain/types'
import {
  useActiveEvent,
  useEvent,
  useEventUpdates,
  useEvents,
  useSetNowPitching,
  type EventRow,
} from '@/features/events/api'
import { EventPhaseBadge } from '@/features/events/EventPhaseBadge'
import { ExportMenu } from '@/features/export/ExportMenu'
import { TimerPanel } from '@/features/timer/TimerPanel'
import { useEventResults } from '@/features/reports/useEventResults'
import type { TeamWithProject } from '@/features/teams/api'
import { useNow } from '@/lib/useNow'
import { LateScoresNotice } from './LateScoresNotice'
import { LiveRanking } from './LiveRanking'
import { ProgressBoard } from './ProgressBoard'

/** Phase badge + formatted start/end dates, reused from the events list's own date line. */
function EventSummary({ event, now }: { event: EventRow; now: Date }) {
  const { i18n } = useTranslation()
  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <span className="flex flex-wrap items-center gap-2">
      <EventPhaseBadge event={event} now={now} />
      <span>
        {dateFormat.format(new Date(event.startsAt))} – {dateFormat.format(new Date(event.endsAt))}
      </span>
    </span>
  )
}

/** "Now pitching" control: pick a team directly, advance to the next one in pitch order,
 * or clear the stage. All three go through `set_now_pitching`, kept live for jurors via
 * `useEventUpdates`. Exported for its own direct test. */
export function NowPitchingCard({ event, teams }: { event: EventRow; teams: TeamWithProject[] }) {
  const { t } = useTranslation()
  const setNowPitching = useSetNowPitching()

  const currentIndex = teams.findIndex((team) => team.id === event.nowPitchingTeamId)
  const current = currentIndex === -1 ? null : teams[currentIndex]
  const next = currentIndex === -1 ? teams[0] : teams[currentIndex + 1]

  async function set(teamId: Id | null) {
    try {
      await setNowPitching.mutateAsync({ eventId: event.id, teamId })
    } catch {
      toast.error(t('dashboard.nowPitching.error'))
    }
  }

  return (
    <section aria-labelledby="on-stage-heading" className="flex flex-col gap-4 p-5 sm:p-6">
      <h2 id="on-stage-heading" className="text-sm font-semibold text-ink-muted">
        {t('dashboard.nowPitching.heading')}
      </h2>

      <div className="min-w-0">
        <p className="title text-3xl break-words sm:text-4xl">
          {current ? (
            <span className="marked-text">{current.name}</span>
          ) : (
            <span className="text-ink-muted">{t('dashboard.nowPitching.none')}</span>
          )}
        </p>
        {current?.project.name && <p className="mt-2 text-ink-muted">{current.project.name}</p>}
        <p className="mt-2 text-sm text-ink-muted">
          {next
            ? t('dashboard.nowPitching.upNext', { team: next.name })
            : current
              ? t('dashboard.nowPitching.lastTeam')
              : null}
        </p>
      </div>

      <div className="mt-auto flex flex-col gap-2 pt-2">
        <Button size="lg" disabled={!next} onClick={() => next && void set(next.id)} className="self-start">
          <SkipForward aria-hidden />
          {t('dashboard.nowPitching.next')}
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label={t('dashboard.nowPitching.selectLabel')}
            value={current?.id ?? ''}
            disabled={teams.length === 0}
            onChange={(e) => void set(e.target.value || null)}
            className="w-full sm:w-64"
          >
            <option value="">{t('dashboard.nowPitching.placeholder')}</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.noShow ? t('dashboard.nowPitching.noShowOption', { name: team.name }) : team.name}
              </option>
            ))}
          </Select>
          <Button variant="ghost" disabled={!current} onClick={() => void set(null)}>
            {t('dashboard.nowPitching.clear')}
          </Button>
        </div>
      </div>
    </section>
  )
}

/** The organizer's live view of the active event: who's pitching, scoring progress per
 * juror/team, the live ranking, and any late scores waiting to be unlocked. */
export function DashboardPage() {
  const { t } = useTranslation()
  const events = useEvents()
  const active = useActiveEvent()
  const eventId = active?.id ?? ''
  useEventUpdates(eventId)
  // The single-event query is the one Realtime writes into; fall back to the list row.
  const { data: live } = useEvent(eventId)
  const event = live ?? active ?? undefined
  const now = useNow(30_000)
  const results = useEventResults(eventId)

  if (events.isLoading) {
    return (
      <Page>
        <PageHeader title={<Skeleton className="h-9 w-56" />} />
        <div className="flex flex-col gap-6">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Page>
    )
  }

  if (!event) {
    return (
      <Page>
        <PageHeader title={t('dashboard.title')} />
        <EmptyState
          icon={CalendarRange}
          title={t('dashboard.emptyTitle')}
          description={t('dashboard.emptyBody')}
          action={
            <Link to="/admin/events" className={buttonClasses()}>
              {t('dashboard.emptyAction')}
            </Link>
          }
        />
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader
        title={event.name}
        description={<EventSummary event={event} now={now} />}
        actions={<ExportMenu eventId={event.id} />}
      />

      <div className="flex flex-col gap-6">
        {/* One desk: who is on stage and the clock that times them. */}
        <Card className="grid divide-y divide-line lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <NowPitchingCard event={event} teams={results.teams} />
          <TimerPanel event={event} />
        </Card>

        <LateScoresNotice eventId={event.id} teams={results.teams} jurors={results.jurors} />

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.progress.heading')}</CardTitle>
            </CardHeader>
            <CardBody>
              {results.isLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <ProgressBoard
                  teams={results.teams}
                  criteria={results.criteria}
                  jurors={results.jurors}
                  scores={results.scores}
                />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.ranking.heading')}</CardTitle>
            </CardHeader>
            <CardBody>
              {results.isLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <LiveRanking ranked={results.ranked} teams={results.teams} />
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </Page>
  )
}
