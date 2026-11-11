import { Minus, Pause, Play, Plus, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import type { TimerView } from '@/domain/pitchTimer'
import type { Id } from '@/domain/types'
import { cn } from '@/lib/cn'
import { ADJUST_SECONDS, useTimerActions } from './useTimerActions'

type TimerControlsProps = {
  eventId: Id
  view: Pick<TimerView, 'phase' | 'mode'>
  className?: string
}

/** Start/pause, reset and the 30-second adjusters: the organizer's timer remote. A
 * countdown to a time of day has nothing to start or pause, so it only offers the rest. */
export function TimerControls({ eventId, view, className }: TimerControlsProps) {
  const { t } = useTranslation()
  const { run, pending } = useTimerActions(eventId)
  const running = view.phase === 'running'
  const until = view.mode === 'until'

  return (
    <div role="group" aria-label={t('timer.controls')} className={cn('flex flex-wrap items-center gap-2', className)}>
      {!until && (
        <Button
          size="lg"
          disabled={pending}
          onClick={() => void run({ action: running ? 'pause' : 'start' })}
          className="min-w-36"
        >
          {running ? <Pause aria-hidden /> : <Play aria-hidden />}
          {running ? t('timer.pause') : view.phase === 'paused' ? t('timer.resume') : t('timer.start')}
        </Button>
      )}
      <Button
        variant="secondary"
        size="lg"
        className="px-4"
        disabled={pending || view.phase === 'ready'}
        onClick={() => void run({ action: 'reset' })}
      >
        <RotateCcw aria-hidden />
        {until ? t('timer.stop') : t('timer.reset')}
      </Button>
      <div className="flex gap-1">
        <Button
          variant="secondary"
          size="lg"
          className="px-4"
          disabled={pending}
          aria-label={t('timer.remove')}
          onClick={() => void run({ action: 'add', seconds: -ADJUST_SECONDS })}
        >
          <Minus aria-hidden />
          <span className="tabular-nums">{ADJUST_SECONDS}s</span>
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className="px-4"
          disabled={pending}
          aria-label={t('timer.add')}
          onClick={() => void run({ action: 'add', seconds: ADJUST_SECONDS })}
        >
          <Plus aria-hidden />
          <span className="tabular-nums">{ADJUST_SECONDS}s</span>
        </Button>
      </div>
    </div>
  )
}
