import { Minus, Pause, Play, Plus, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import type { TimerPhase } from '@/domain/pitchTimer'
import type { Id } from '@/domain/types'
import { cn } from '@/lib/cn'
import { ADJUST_SECONDS, useTimerActions } from './useTimerActions'

type TimerControlsProps = {
  eventId: Id
  phase: TimerPhase
  /** `lg` for the projector page, where the buttons are used from across a desk. */
  size?: 'md' | 'lg'
  className?: string
}

/** Start/pause, reset and the 30-second adjusters: the organizer's whole timer remote. */
export function TimerControls({ eventId, phase, size = 'md', className }: TimerControlsProps) {
  const { t } = useTranslation()
  const { run, pending } = useTimerActions(eventId)
  const running = phase === 'running'

  return (
    <div role="group" aria-label={t('timer.controls')} className={cn('flex flex-wrap items-center gap-2', className)}>
      <Button size={size} disabled={pending} onClick={() => run(running ? 'pause' : 'start')} className="min-w-32">
        {running ? <Pause aria-hidden /> : <Play aria-hidden />}
        {running ? t('timer.pause') : phase === 'paused' ? t('timer.resume') : t('timer.start')}
      </Button>
      <Button variant="secondary" size={size} disabled={pending || phase === 'ready'} onClick={() => run('reset')}>
        <RotateCcw aria-hidden />
        {t('timer.reset')}
      </Button>
      <div className="flex gap-1">
        <Button
          variant="secondary"
          size={size}
          disabled={pending}
          aria-label={t('timer.remove')}
          onClick={() => run('add', -ADJUST_SECONDS)}
        >
          <Minus aria-hidden />
          <span className="tabular-nums">{ADJUST_SECONDS}s</span>
        </Button>
        <Button
          variant="secondary"
          size={size}
          disabled={pending}
          aria-label={t('timer.add')}
          onClick={() => run('add', ADJUST_SECONDS)}
        >
          <Plus aria-hidden />
          <span className="tabular-nums">{ADJUST_SECONDS}s</span>
        </Button>
      </div>
    </div>
  )
}
