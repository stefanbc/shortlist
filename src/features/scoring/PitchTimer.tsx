import { Mic, RotateCcw, Timer } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { formatClock, type PitchTimer as PitchTimerState } from '@/domain/pitchTimer'
import { useTimerView } from '@/features/timer/useTimerView'
import { cn } from '@/lib/cn'

type PitchTimerProps = {
  pitchMinutes: number
  /** The organizer's shared timer when this team is on stage; null when it isn't. */
  shared: PitchTimerState | null
}

function clock(ms: number): string {
  const total = Math.floor(Math.abs(ms) / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** Informational pitch countdown. For the team on stage it mirrors the organizer's timer
 * (ready, running, paused, over); for any other team the juror can run their own. It
 * never locks anything. */
export function PitchTimer({ pitchMinutes, shared }: PitchTimerProps) {
  if (shared) return <SharedTimer pitchMinutes={pitchMinutes} timer={shared} />
  return <OwnTimer pitchMinutes={pitchMinutes} />
}

/** The organizer's clock, read-only. Exported for the juror home's on-stage block. */
export function SharedTimer({
  pitchMinutes,
  timer,
  className,
}: {
  pitchMinutes: number
  timer: PitchTimerState
  className?: string
}) {
  const { t } = useTranslation()
  const view = useTimerView(timer, pitchMinutes)
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
        view.closing && 'marked',
        view.over && 'bg-danger-soft text-danger',
        className,
      )}
    >
      <Mic aria-hidden className="size-4" />
      {label}
    </span>
  )
}

function OwnTimer({ pitchMinutes }: { pitchMinutes: number }) {
  const { t } = useTranslation()
  const [localStart, setLocalStart] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const start = localStart
  const running = start !== null

  useEffect(() => {
    if (!running) return
    const tick = () => setNow(Date.now())
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [running])

  function startLocal() {
    // One reading for both, so the first frame shows the full pitch time.
    const at = Date.now()
    setLocalStart(at)
    setNow(at)
  }

  if (start === null) {
    return (
      <Button variant="secondary" onClick={startLocal}>
        <Timer aria-hidden />
        {t('scoring.timer.start', { minutes: pitchMinutes })}
      </Button>
    )
  }

  const left = start + pitchMinutes * 60_000 - now
  const over = left < 0
  const label = over
    ? t('scoring.timer.over', { time: clock(left) })
    : t('scoring.timer.left', { time: clock(left) })

  return (
    <div className="flex items-center gap-1">
      <span
        role="timer"
        className={cn(
          'inline-flex h-11 items-center gap-2 rounded-control bg-raised px-3.5 text-sm font-semibold text-ink tabular-nums',
          over && 'bg-danger-soft text-danger',
        )}
      >
        <Timer aria-hidden className="size-4" />
        {label}
      </span>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setLocalStart(null)}
        aria-label={t('scoring.timer.reset')}
      >
        <RotateCcw aria-hidden />
      </Button>
    </div>
  )
}
