import { CalendarRange, ChevronRight, Copy, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { DialogContent, DialogFooter, Dialog as DialogRoot } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadMore } from '@/components/ui/LoadMore'
import { usePaging } from '@/components/ui/usePaging'
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

function EventRowLink({ event }: { event: EventRow }) {
  const { t, i18n } = useTranslation()
  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <Link
      to={`/admin/events/${event.id}/settings`}
      className="group flex items-center gap-4 px-5 py-4 -outline-offset-2 transition-colors duration-(--duration-fast) hover:bg-raised"
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="title text-xl break-words">{event.name}</span>
          <EventPhaseBadge event={event} />
        </span>
        <span className="mt-1 block text-sm text-ink-muted">
          {dateFormat.format(new Date(event.startsAt))} – {dateFormat.format(new Date(event.endsAt))}
          <span className="text-ink-faint">
            , {event.pitchMinutes} {t('events.pitchMinutesSuffix')}
          </span>
        </span>
      </span>
      <span className="hidden text-sm font-semibold text-ink-muted group-hover:text-ink sm:inline">
        {t('events.manage')}
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-faint" />
    </Link>
  )
}

export function EventsPage() {
  const { t } = useTranslation()
  const paging = usePaging()
  const { data: events, isLoading } = useEvents()
  const [createOpen, setCreateOpen] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)

  const hasEvents = Boolean(events && events.length > 0)
  const paged = paging.of(events ?? [])

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
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
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
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {paged.visible.map((event) => (
            <li key={event.id}>
              <EventRowLink event={event} />
            </li>
          ))}
        </ul>
      )}

      <LoadMore remaining={isLoading ? 0 : paged.remaining} onLoadMore={paged.loadMore} />

      <CreateEventDialog open={createOpen} onOpenChange={setCreateOpen} />
      <CopyEventDialog open={copyOpen} onOpenChange={setCopyOpen} sources={events ?? []} />
    </Page>
  )
}
