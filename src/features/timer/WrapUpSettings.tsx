import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { describedBy } from '@/components/ui/fieldStyles'
import { Input } from '@/components/ui/Input'
import { DEFAULT_RED_S, DEFAULT_YELLOW_S, formatDuration, parseDuration } from '@/domain/pitchTimer'
import type { EventRow } from '@/features/events/api'
import { cn } from '@/lib/cn'
import { useTimerActions } from './useTimerActions'

const MAX_SECONDS = 3600

/** "1:00" as seconds. Unlike a timer length, a bare number here means seconds would be
 * ambiguous, so it is read as minutes like everywhere else. */
function parse(value: string): number | null {
  const seconds = parseDuration(value)
  return seconds === null || seconds > MAX_SECONDS ? null : seconds
}

/** Event settings: when the timer turns yellow and red. */
export function WrapUpSettings({ event }: { event: EventRow }) {
  const yellow = event.timerYellowS ?? DEFAULT_YELLOW_S
  const red = event.timerRedS ?? DEFAULT_RED_S
  // Keyed on the saved values so the fields follow a save made on another screen.
  return <WrapUpForm key={`${yellow}:${red}`} event={event} yellow={yellow} red={red} />
}

function WrapUpForm({ event, yellow, red }: { event: EventRow; yellow: number; red: number }) {
  const { t } = useTranslation()
  const { run, pending } = useTimerActions(event.id)
  const [yellowText, setYellowText] = useState(formatDuration(yellow))
  const [redText, setRedText] = useState(formatDuration(red))
  const [error, setError] = useState<{ field: 'yellow' | 'red'; kind: 'format' | 'order' } | null>(null)

  async function handleSubmit(submit: FormEvent) {
    submit.preventDefault()
    const nextYellow = parse(yellowText)
    const nextRed = parse(redText)
    if (nextYellow === null) return setError({ field: 'yellow', kind: 'format' })
    if (nextRed === null) return setError({ field: 'red', kind: 'format' })
    if (nextRed > nextYellow) return setError({ field: 'red', kind: 'order' })
    setError(null)
    if (await run({ action: 'wrap_up', yellow: nextYellow, red: nextRed })) {
      toast.success(t('timer.wrapUpSettings.saved'))
    }
  }

  const message = error
    ? t(error.kind === 'format' ? 'timer.wrapUpSettings.errorFormat' : 'timer.wrapUpSettings.errorOrder')
    : undefined

  const fields = [
    { key: 'yellow' as const, value: yellowText, set: setYellowText, swatch: 'bg-mark' },
    { key: 'red' as const, value: redText, set: setRedText, swatch: 'bg-danger' },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('timer.wrapUpSettings.title')}</CardTitle>
      </CardHeader>
      <CardBody>
        <form onSubmit={(submit) => void handleSubmit(submit)} className="flex flex-col gap-4">
          <p className="text-sm text-ink-muted">{t('timer.wrapUpSettings.description')}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map(({ key, value, set, swatch }) => {
              const id = `wrap-up-${key}`
              const fieldError = error?.field === key ? message : undefined
              return (
                <Field key={key} id={id} label={t(`timer.wrapUpSettings.${key}Label`)} error={fieldError}>
                  <div className="flex items-center gap-3">
                    <span aria-hidden className={cn('h-11 w-2 shrink-0 rounded-full', swatch)} />
                    <Input
                      id={id}
                      inputMode="numeric"
                      autoComplete="off"
                      value={value}
                      aria-invalid={Boolean(fieldError)}
                      aria-describedby={describedBy(id, { error: fieldError })}
                      onChange={(change) => {
                        set(change.target.value)
                        setError(null)
                      }}
                      className="numeral max-w-32 text-xl"
                    />
                  </div>
                </Field>
              )
            })}
          </div>
          <p className="text-sm text-ink-faint">{t('timer.wrapUpSettings.hint')}</p>
          <div>
            <Button type="submit" variant="secondary" loading={pending}>
              {t('timer.wrapUpSettings.save')}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}
