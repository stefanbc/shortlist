import { Mic, RotateCcw, Timer } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

type PitchTimerProps = {
  pitchMinutes: number
  /** When the organizer marked this team as pitching; null when it isn't on stage. */
  onStageSince: string | null
}

function clock(ms: number): string {
  const total = Math.floor(Math.abs(ms) / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** Informational pitch countdown. Counts from the organizer's "now pitching" moment when
 * this team is on stage, otherwise from when the juror starts it. It never locks anything. */
export function PitchTimer({ pitchMinutes, onStageSince }: PitchTimerProps) {
  const { t } = useTranslation()
  const [localStart, setLocalStart] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const start = onStageSince ? new Date(onStageSince).getTime() : localStart
  const running = start !== null

  useEffect(() => {
    if (!running) return
    const tick = () => setNow(Date.now())
    // Catch up straight away (the stage may have changed long after mount), then every second.
    const first = setTimeout(tick, 0)
    const id = setInterval(tick, 1000)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [running])

  if (start === null) {
    return (
      <Button variant="secondary" onClick={() => setLocalStart(Date.now())}>
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
        aria-label={onStageSince ? t('scoring.timer.onStageLabel') : undefined}
        className={cn(
          'inline-flex h-11 items-center gap-2 rounded-control px-3.5 text-sm font-semibold tabular-nums ring-1 ring-inset',
          onStageSince ? 'bg-gold-soft text-gold ring-gold/30' : 'bg-raised text-ink ring-line',
          over && 'bg-danger-soft text-danger ring-danger/30',
        )}
      >
        {onStageSince ? (
          <Mic aria-hidden className="size-4" />
        ) : (
          <Timer aria-hidden className="size-4" />
        )}
        {label}
      </span>
      {!onStageSince && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocalStart(null)}
          aria-label={t('scoring.timer.reset')}
        >
          <RotateCcw aria-hidden />
        </Button>
      )}
    </div>
  )
}
