import { ExternalLink } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { describedBy } from '@/components/ui/fieldStyles'
import { Input } from '@/components/ui/Input'
import type { Id } from '@/domain/types'
import { parseStagetimerUrl, useSaveStagetimerUrl, useStagetimerUrl, type StagetimerUrlError } from './stagetimerUrl'

/** Event settings: where the organizer pastes the stagetimer.io viewer link. */
export function StageTimerSettings({ eventId }: { eventId: Id }) {
  const saved = useStagetimerUrl(eventId)
  if (!saved.isFetched) return null
  // Keyed on the saved value so the field starts from it and resets after a save.
  return <StageTimerForm key={saved.data ?? ''} eventId={eventId} saved={saved.data ?? null} />
}

function StageTimerForm({ eventId, saved }: { eventId: Id; saved: string | null }) {
  const { t } = useTranslation()
  const save = useSaveStagetimerUrl(eventId)
  const [value, setValue] = useState(saved ?? '')
  const [error, setError] = useState<StagetimerUrlError | null>(null)
  const id = 'event-stagetimer'
  const hint = t('events.stagetimer.hint')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = parseStagetimerUrl(value)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setError(null)
    try {
      await save.mutateAsync(parsed.url)
      toast.success(parsed.url ? t('events.stagetimer.saved') : t('events.stagetimer.removed'))
    } catch {
      toast.error(t('events.stagetimer.saveError'))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('events.stagetimer.title')}</CardTitle>
      </CardHeader>
      <CardBody>
        <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
          <Field
            id={id}
            label={t('events.stagetimer.label')}
            hint={hint}
            error={error ? t(`events.stagetimer.errors.${error}`) : undefined}
            optional
          >
            <Input
              id={id}
              // Plain text, not type="url": a link pasted without "https://" must reach our
              // own check (which adds it) instead of being stopped by the browser.
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://stagetimer.io/r/…"
              value={value}
              aria-invalid={Boolean(error)}
              aria-describedby={describedBy(id, { hint, error })}
              onChange={(event) => setValue(event.target.value)}
            />
          </Field>
          <div>
            <Button type="submit" variant="secondary" loading={save.isPending}>
              {t('events.stagetimer.save')}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}

/** Live dashboard: the stagetimer room in a frame. Renders nothing when the event has no
 * link. The frame can run the timer page's scripts but cannot navigate this page. */
export function StageTimerPanel({ eventId }: { eventId: Id }) {
  const { t } = useTranslation()
  const { data: url } = useStagetimerUrl(eventId)
  if (!url) return null

  return (
    <Card>
      <CardHeader className="items-center pb-4">
        <CardTitle>{t('events.stagetimer.title')}</CardTitle>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-ink underline underline-offset-2"
        >
          <ExternalLink aria-hidden className="size-3.5" />
          {t('events.stagetimer.openInTab')}
        </a>
      </CardHeader>
      <iframe
        src={url}
        title={t('events.stagetimer.frameTitle')}
        loading="lazy"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin"
        className="block h-64 w-full rounded-b-card border-t border-line bg-black lg:h-72"
      />
    </Card>
  )
}
