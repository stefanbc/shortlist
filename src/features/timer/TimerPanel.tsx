import { Presentation, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { formatClock } from '@/domain/pitchTimer'
import type { EventRow } from '@/features/events/api'
import { cn } from '@/lib/cn'
import { TimerControls } from './TimerControls'
import { TimerSetupDialog } from './TimerSetupDialog'
import { barWarningClasses, clockWarningClasses } from './timerStyles'
import { useTimerStatus } from './useTimerStatus'
import { useTimerView } from './useTimerView'

/** The organizer's timer on the live page: the clock, what it is counting, its controls,
 * set-up and the way to the projector page. Choosing a team resets it; it is started by
 * hand, when the team actually begins. */
export function TimerPanel({ event }: { event: EventRow }) {
  const { t } = useTranslation()
  const [setupOpen, setSetupOpen] = useState(false)
  const view = useTimerView(event)
  const status = useTimerStatus(event, view)
  const clock = formatClock(view.remainingMs)

  return (
    <section aria-labelledby="timer-heading" className="flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="timer-heading" className="text-sm font-semibold text-ink-muted">
          {event.timer?.label ?? t('timer.heading')}
        </h2>
        <p className="text-sm text-ink-muted" role="status">
          {status}
        </p>
      </div>

      <p
        role="timer"
        aria-label={view.over ? t('timer.clockOver', { time: clock }) : t('timer.clockLeft', { time: clock })}
        className={cn(
          'numeral self-start text-[5.5rem] leading-none sm:text-[7rem]',
          view.warning !== 'none' && 'px-3',
          clockWarningClasses(view.warning),
          view.phase === 'paused' && view.warning === 'none' && 'text-ink-muted',
        )}
      >
        {view.over && '+'}
        {clock}
      </p>

      <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-sunken">
        <div
          className={cn('h-full rounded-full', barWarningClasses(view.warning))}
          style={{ width: `${view.progress * 100}%` }}
        />
      </div>

      <TimerControls eventId={event.id} view={view} />

      <div className="-mx-2 -mb-2 flex flex-wrap gap-1">
        <Button variant="ghost" onClick={() => setSetupOpen(true)}>
          <Settings2 aria-hidden />
          {t('timer.setup.open')}
        </Button>
        <Link to={`/stage/${event.id}`} target="_blank" rel="noopener" className={buttonClasses({ variant: 'ghost' })}>
          <Presentation aria-hidden />
          {t('timer.projector')}
        </Link>
      </div>

      <TimerSetupDialog event={event} open={setupOpen} onOpenChange={setSetupOpen} />
    </section>
  )
}
