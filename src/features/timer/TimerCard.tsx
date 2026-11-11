import { Presentation } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/Badge'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { formatClock } from '@/domain/pitchTimer'
import type { EventRow } from '@/features/events/api'
import { cn } from '@/lib/cn'
import { TimerControls } from './TimerControls'
import { useTimerView } from './useTimerView'

/** The organizer's timer on the live dashboard: the clock, its controls and the way to
 * the projector page. Choosing a team in "Now pitching" resets it; it is started by hand,
 * when the team actually begins. */
export function TimerCard({ event }: { event: EventRow }) {
  const { t } = useTranslation()
  const view = useTimerView(event.timer, event.pitchMinutes)
  const clock = formatClock(view.remainingMs)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('timer.heading')}</CardTitle>
        {view.over ? (
          <Badge tone="danger">{t('timer.over')}</Badge>
        ) : view.phase === 'running' ? (
          <Badge tone="success" dot="live">
            {t('timer.running')}
          </Badge>
        ) : (
          <Badge>{view.phase === 'paused' ? t('timer.paused') : t('timer.ready')}</Badge>
        )}
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <p
          role="timer"
          aria-label={view.over ? t('timer.clockOver', { time: clock }) : t('timer.clockLeft', { time: clock })}
          className={cn(
            'numeral self-start text-7xl leading-none',
            view.over && 'text-danger',
            view.closing && 'marked px-2',
          )}
        >
          {view.over && '+'}
          {clock}
        </p>
        <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-sunken">
          <div
            className={cn('h-full rounded-full bg-accent', view.closing && 'bg-mark', view.over && 'bg-danger')}
            style={{ width: `${view.progress * 100}%` }}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TimerControls eventId={event.id} phase={view.phase} />
          <Link
            to={`/stage/${event.id}`}
            target="_blank"
            rel="noopener"
            className={buttonClasses({ variant: 'ghost' })}
          >
            <Presentation aria-hidden />
            {t('timer.projector')}
          </Link>
        </div>
      </CardBody>
    </Card>
  )
}
