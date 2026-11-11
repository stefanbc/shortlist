import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog'
import { Field } from '@/components/ui/Field'
import { describedBy } from '@/components/ui/fieldStyles'
import { Input } from '@/components/ui/Input'
import { formatDuration, nextTimeOfDay, parseDuration } from '@/domain/pitchTimer'
import type { EventRow } from '@/features/events/api'
import { cn } from '@/lib/cn'
import { useTimerActions } from './useTimerActions'

type Mode = 'duration' | 'until'

/** Lengths offered as one-tap choices beside the event's own pitch length (minutes). */
const PRESET_MINUTES = [3, 5, 10, 15]

type TimerSetupDialogProps = {
  event: EventRow
  open: boolean
  onOpenChange(open: boolean): void
}

/** Sets up the next countdown: for a length of time (a pitch, questions) or until a time
 * of day (a break that ends at 13:30), with an optional name for the projector. */
export function TimerSetupDialog({ event, open, onOpenChange }: TimerSetupDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('timer.setup.title')} description={t('timer.setup.description')}>
        {/* Mounted with the dialog, so every opening starts from the current timer. */}
        <SetupForm event={event} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function SetupForm({ event, onDone }: { event: EventRow; onDone(): void }) {
  const { t, i18n } = useTranslation()
  const ids = useId()
  const { run, pending } = useTimerActions(event.id)
  const pitchSeconds = event.pitchMinutes * 60

  const [mode, setMode] = useState<Mode>(event.timer?.targetAt ? 'until' : 'duration')
  const [duration, setDuration] = useState(formatDuration(event.timer?.durationS ?? pitchSeconds))
  const [time, setTime] = useState('')
  const [label, setLabel] = useState(event.timer?.label ?? '')
  const [error, setError] = useState<'duration' | 'time' | null>(null)

  const target = mode === 'until' ? nextTimeOfDay(time, new Date()) : null
  const tomorrow = target !== null && target.getDate() !== new Date().getDate()

  async function handleSubmit(submit: FormEvent) {
    submit.preventDefault()
    const name = label.trim() || undefined
    if (mode === 'duration') {
      const seconds = parseDuration(duration)
      if (seconds === null || seconds < 10 || seconds > 14_400) return setError('duration')
      setError(null)
      // The event's own pitch length is stored as "no override", so it follows later edits.
      const ok = await run({
        action: 'duration',
        seconds: seconds === pitchSeconds && !name ? null : seconds,
        label: name,
      })
      if (ok) onDone()
    } else {
      if (!target) return setError('time')
      setError(null)
      if (await run({ action: 'until', target, label: name })) onDone()
    }
  }

  const durationId = `${ids}-duration`
  const timeId = `${ids}-time`
  const labelId = `${ids}-label`

  return (
    <form onSubmit={(submit) => void handleSubmit(submit)} className="mt-6 flex flex-col gap-5">
      <fieldset>
        <legend className="sr-only">{t('timer.setup.modeLegend')}</legend>
        <div className="grid grid-cols-2 gap-1 rounded-control bg-sunken p-1">
          {(['duration', 'until'] as const).map((value) => (
            <label key={value} className="relative">
              <input
                type="radio"
                name={`${ids}-mode`}
                value={value}
                checked={mode === value}
                onChange={() => {
                  setMode(value)
                  setError(null)
                }}
                className="peer sr-only"
              />
              <span
                className={cn(
                  'flex h-11 cursor-pointer items-center justify-center rounded-[0.25rem] px-2 text-[0.95rem] font-medium text-ink-muted hover:text-ink',
                  'peer-checked:bg-surface peer-checked:font-semibold peer-checked:text-ink peer-checked:ring-1 peer-checked:ring-line-strong dark:peer-checked:bg-raised',
                  'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-ring',
                )}
              >
                {t(`timer.setup.mode.${value}`)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {mode === 'duration' ? (
        <Field
          id={durationId}
          label={t('timer.setup.durationLabel')}
          hint={t('timer.setup.durationHint')}
          error={error === 'duration' ? t('timer.setup.durationError') : undefined}
        >
          <Input
            id={durationId}
            inputMode="numeric"
            autoComplete="off"
            value={duration}
            aria-invalid={error === 'duration'}
            aria-describedby={describedBy(durationId, { hint: true, error: error === 'duration' })}
            onChange={(change) => setDuration(change.target.value)}
            className="numeral h-14 max-w-40 text-3xl"
          />
          <div className="flex flex-wrap gap-1.5">
            {[event.pitchMinutes, ...PRESET_MINUTES.filter((m) => m !== event.pitchMinutes)].map(
              (minutes, index) => (
                <Button
                  key={minutes}
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setDuration(formatDuration(minutes * 60))
                    setError(null)
                  }}
                >
                  {index === 0
                    ? t('timer.setup.presetPitch', { minutes })
                    : t('timer.setup.presetMinutes', { minutes })}
                </Button>
              ),
            )}
          </div>
        </Field>
      ) : (
        <Field
          id={timeId}
          label={t('timer.setup.timeLabel')}
          hint={
            target
              ? t(tomorrow ? 'timer.setup.timeHintTomorrow' : 'timer.setup.timeHintToday', {
                  time: new Intl.DateTimeFormat(i18n.language, { timeStyle: 'short' }).format(target),
                })
              : t('timer.setup.timeHint')
          }
          error={error === 'time' ? t('timer.setup.timeError') : undefined}
        >
          <Input
            id={timeId}
            type="time"
            value={time}
            aria-invalid={error === 'time'}
            aria-describedby={describedBy(timeId, { hint: true, error: error === 'time' })}
            onChange={(change) => {
              setTime(change.target.value)
              setError(null)
            }}
            className="numeral h-14 max-w-48 text-3xl"
          />
        </Field>
      )}

      <Field id={labelId} label={t('timer.setup.labelLabel')} hint={t('timer.setup.labelHint')} optional>
        <Input
          id={labelId}
          maxLength={80}
          value={label}
          placeholder={t('timer.setup.labelPlaceholder')}
          aria-describedby={describedBy(labelId, { hint: true })}
          onChange={(change) => setLabel(change.target.value)}
        />
      </Field>

      <DialogFooter className="mt-2">
        <Button variant="secondary" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={pending}>
          {mode === 'until' ? t('timer.setup.submitUntil') : t('timer.setup.submitDuration')}
        </Button>
      </DialogFooter>
    </form>
  )
}
