import { CalendarRange, Copy, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { DialogContent, DialogFooter, Dialog as DialogRoot } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { describedBy } from '@/components/ui/fieldStyles'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { DateTimeField } from '@/components/ui/DateTimeField'
import { Skeleton } from '@/components/ui/Skeleton'
import { EventPhaseBadge } from './EventPhaseBadge'
import {
  EVENT_FORM_ERROR_KEYS,
  fromDateTimeLocal,
  useCopyEvent,
  useEvents,
  useSaveEvent,
  validateCopyEventForm,
  validateEventForm,
  type CopyEventFormErrors,
  type EventFormErrorCode,
  type EventFormErrors,
  type EventFormState,
  type EventRow,
} from './api'

const BLANK_FORM: EventFormState = { name: '', startsAt: '', endsAt: '', pitchMinutes: '7' }

function CreateEventDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const saveEvent = useSaveEvent()
  const [form, setForm] = useState<EventFormState>(BLANK_FORM)
  const [errors, setErrors] = useState<EventFormErrors>({})

  function fieldError(code: EventFormErrorCode | undefined) {
    return code ? t(EVENT_FORM_ERROR_KEYS[code]) : undefined
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const result = validateEventForm(form)
    if ('errors' in result) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    try {
      const event = await saveEvent.mutateAsync(result.data)
      toast.success(t('events.created'))
      setForm(BLANK_FORM)
      onOpenChange(false)
      navigate(`/admin/events/${event.id}/settings`)
    } catch {
      toast.error(t('events.saveError'))
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('events.createBlankTitle')} description={t('events.createBlankDescription')}>
        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          <Field id="new-event-name" label={t('events.nameLabel')} error={fieldError(errors.name)}>
            <Input
              id="new-event-name"
              value={form.name}
              aria-describedby={describedBy('new-event-name', { error: errors.name })}
              aria-invalid={Boolean(errors.name)}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="new-event-starts"
              label={t('events.startsAtLabel')}
              error={fieldError(errors.startsAt)}
            >
              <DateTimeField
                id="new-event-starts"
                value={form.startsAt}
                aria-describedby={describedBy('new-event-starts', { error: errors.startsAt })}
                aria-invalid={Boolean(errors.startsAt)}
                onChange={(value) => setForm({ ...form, startsAt: value })}
              />
            </Field>
            <Field id="new-event-ends" label={t('events.endsAtLabel')} error={fieldError(errors.endsAt)}>
              <DateTimeField
                id="new-event-ends"
                value={form.endsAt}
                aria-describedby={describedBy('new-event-ends', { error: errors.endsAt })}
                aria-invalid={Boolean(errors.endsAt)}
                onChange={(value) => setForm({ ...form, endsAt: value })}
              />
            </Field>
          </div>
          <Field
            id="new-event-pitch-minutes"
            label={t('events.pitchMinutesLabel')}
            error={fieldError(errors.pitchMinutes)}
            className="max-w-xs"
          >
            <Input
              id="new-event-pitch-minutes"
              type="number"
              min={1}
              max={60}
              value={form.pitchMinutes}
              aria-describedby={describedBy('new-event-pitch-minutes', { error: errors.pitchMinutes })}
              aria-invalid={Boolean(errors.pitchMinutes)}
              onChange={(e) => setForm({ ...form, pitchMinutes: e.target.value })}
            />
          </Field>
          <DialogFooter>
            <Button type="submit" loading={saveEvent.isPending}>
              {t('events.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </DialogRoot>
  )
}

type CopyFormState = { sourceId: string; name: string; startsAt: string; endsAt: string }

const COPY_FORM: CopyFormState = { sourceId: '', name: '', startsAt: '', endsAt: '' }

function CopyEventDialog({
  open,
  onOpenChange,
  sources,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  sources: EventRow[]
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const copyEvent = useCopyEvent()
  const [form, setForm] = useState<CopyFormState>(COPY_FORM)
  const [errors, setErrors] = useState<CopyEventFormErrors>({})

  function fieldError(code: EventFormErrorCode | undefined) {
    return code ? t(EVENT_FORM_ERROR_KEYS[code]) : undefined
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const validationErrors = validateCopyEventForm(form)
    if (validationErrors) {
      setErrors(validationErrors)
      return
    }
    setErrors({})
    try {
      const newEventId = await copyEvent.mutateAsync({
        sourceId: form.sourceId,
        name: form.name,
        startsAt: fromDateTimeLocal(form.startsAt),
        endsAt: fromDateTimeLocal(form.endsAt),
      })
      toast.success(t('events.created'))
      setForm(COPY_FORM)
      onOpenChange(false)
      navigate(`/admin/events/${newEventId}/settings`)
    } catch {
      toast.error(t('events.saveError'))
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('events.copyTitle')} description={t('events.copyDescription')}>
        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          <Field
            id="copy-event-source"
            label={t('events.copySourceLabel')}
            error={fieldError(errors.sourceId)}
          >
            <Select
              id="copy-event-source"
              value={form.sourceId}
              aria-describedby={describedBy('copy-event-source', { error: errors.sourceId })}
              aria-invalid={Boolean(errors.sourceId)}
              onChange={(e) => setForm({ ...form, sourceId: e.target.value })}
            >
              <option value="">{t('events.copySourcePlaceholder')}</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="copy-event-name" label={t('events.nameLabel')} error={fieldError(errors.name)}>
            <Input
              id="copy-event-name"
              value={form.name}
              aria-describedby={describedBy('copy-event-name', { error: errors.name })}
              aria-invalid={Boolean(errors.name)}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="copy-event-starts"
              label={t('events.startsAtLabel')}
              error={fieldError(errors.startsAt)}
            >
              <DateTimeField
                id="copy-event-starts"
                value={form.startsAt}
                aria-describedby={describedBy('copy-event-starts', { error: errors.startsAt })}
                aria-invalid={Boolean(errors.startsAt)}
                onChange={(value) => setForm({ ...form, startsAt: value })}
              />
            </Field>
            <Field id="copy-event-ends" label={t('events.endsAtLabel')} error={fieldError(errors.endsAt)}>
              <DateTimeField
                id="copy-event-ends"
                value={form.endsAt}
                aria-describedby={describedBy('copy-event-ends', { error: errors.endsAt })}
                aria-invalid={Boolean(errors.endsAt)}
                onChange={(value) => setForm({ ...form, endsAt: value })}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button type="submit" loading={copyEvent.isPending}>
              {t('events.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </DialogRoot>
  )
}

function EventCard({ event }: { event: EventRow }) {
  const { t, i18n } = useTranslation()
  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{event.name}</CardTitle>
        <EventPhaseBadge event={event} />
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <p className="text-sm text-ink-muted">
          {dateFormat.format(new Date(event.startsAt))} – {dateFormat.format(new Date(event.endsAt))}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-faint">
            {event.pitchMinutes} {t('events.pitchMinutesSuffix')}
          </span>
          <Link
            to={`/admin/events/${event.id}/settings`}
            className={buttonClasses({ variant: 'secondary', size: 'sm' })}
          >
            {t('events.manage')}
          </Link>
        </div>
      </CardBody>
    </Card>
  )
}

export function EventsPage() {
  const { t } = useTranslation()
  const { data: events, isLoading } = useEvents()
  const [createOpen, setCreateOpen] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)

  const hasEvents = Boolean(events && events.length > 0)

  return (
    <Page>
      <PageHeader
        title={t('events.title')}
        actions={
          hasEvents ? (
            <>
              <Button variant="secondary" onClick={() => setCopyOpen(true)}>
                <Copy aria-hidden />
                {t('events.copyFromEvent')}
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus aria-hidden />
                {t('events.newEvent')}
              </Button>
            </>
          ) : undefined
        }
      />

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      )}

      {!isLoading && !hasEvents && (
        <EmptyState
          icon={CalendarRange}
          title={t('events.emptyTitle')}
          description={t('events.emptyDescription')}
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden />
              {t('events.newEvent')}
            </Button>
          }
        />
      )}

      {!isLoading && hasEvents && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events!.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}

      <CreateEventDialog open={createOpen} onOpenChange={setCreateOpen} />
      <CopyEventDialog open={copyOpen} onOpenChange={setCopyOpen} sources={events ?? []} />
    </Page>
  )
}
