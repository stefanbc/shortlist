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
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  eventFieldErrorMessage,
  fromDateTimeLocal,
  useCopyEvent,
  useEvents,
  useSaveEvent,
  validateCopyEventForm,
  validateEventForm,
  type CopyEventFormErrors,
  type EventFormErrors,
  type EventFormState,
  type EventRow,
} from './api'
import { EventFormFields } from './EventFormFields'
import { EventPhaseBadge } from './EventPhaseBadge'

const BLANK_FORM: EventFormState = { name: '', startsAt: '', endsAt: '', pitchMinutes: '7' }

function CreateEventDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const saveEvent = useSaveEvent()
  const [form, setForm] = useState<EventFormState>(BLANK_FORM)
  const [errors, setErrors] = useState<EventFormErrors>({})

  // Dialog is portalled and its own form fields only exist while open, but its errors
  // live in this component's state across opens — clear them so a stale error from a
  // previous attempt doesn't flash when the dialog is reopened.
  function handleOpenChange(next: boolean) {
    if (!next) setErrors({})
    onOpenChange(next)
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
      handleOpenChange(false)
      navigate(`/admin/events/${event.id}/settings`)
    } catch {
      toast.error(t('events.saveError'))
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={handleOpenChange}>
      <DialogContent title={t('events.createBlankTitle')} description={t('events.createBlankDescription')}>
        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          <EventFormFields idPrefix="new-event" form={form} errors={errors} setForm={setForm} />
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

  function handleOpenChange(next: boolean) {
    if (!next) setErrors({})
    onOpenChange(next)
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
      handleOpenChange(false)
      navigate(`/admin/events/${newEventId}/settings`)
    } catch {
      toast.error(t('events.saveError'))
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={handleOpenChange}>
      <DialogContent title={t('events.copyTitle')} description={t('events.copyDescription')}>
        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          <Field
            id="copy-event-source"
            label={t('events.copySourceLabel')}
            error={eventFieldErrorMessage(t, errors.sourceId)}
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
          <EventFormFields
            idPrefix="copy-event"
            form={form}
            errors={errors}
            setForm={setForm}
            showPitchMinutes={false}
          />
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
