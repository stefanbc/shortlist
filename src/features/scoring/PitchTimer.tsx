import { Mic } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatClock } from '@/domain/pitchTimer'
import { useTimerView, type TimerSource } from '@/features/timer/useTimerView'
import { cn } from '@/lib/cn'

type PitchTimerProps = {
  /** The event, when this team is on stage; null when it isn't. */
  shared: TimerSource | null
}

/** The pitch countdown on a juror's scoring screen. Only the organizer runs the timer:
 * a juror sees it, read-only, for the team on stage, and nothing for any other team.
 * It is informational and never locks anything. */
export function PitchTimer({ shared }: PitchTimerProps) {
  return shared ? <SharedTimer source={shared} /> : null
}

/** The organizer's clock, read-only. Exported for the juror home. */
export function SharedTimer({ source, className }: { source: TimerSource; className?: string }) {
  const { t } = useTranslation()
  const view = useTimerView(source)
  const time = formatClock(view.remainingMs)
  const label = view.over
    ? t('scoring.timer.over', { time })
    : view.phase === 'ready'
      ? t('scoring.timer.ready', { time })
      : view.phase === 'paused'
        ? t('scoring.timer.paused', { time })
        : t('scoring.timer.left', { time })

  return (
    <span
      role="timer"
      aria-label={t('scoring.timer.onStageLabel')}
      className={cn(
        'inline-flex h-11 items-center gap-2 rounded-control bg-raised px-3.5 text-sm font-semibold text-ink tabular-nums',
        className,
        view.warning === 'yellow' && 'marked',
        view.warning === 'red' && 'bg-danger text-canvas',
      )}
    >
      <Mic aria-hidden className="size-4" />
      {label}
    </span>
  )
}
