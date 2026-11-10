import type { TFunction } from 'i18next'
import { ArrowLeft } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DateTimeField } from '@/components/ui/DateTimeField'
import { Field } from '@/components/ui/Field'
import { describedBy } from '@/components/ui/fieldStyles'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import type { StatusOverride } from '@/domain/eventPhase'
import type { Id } from '@/domain/types'
import {
  EVENT_FORM_ERROR_KEYS,
  toEventFormState,
  useEvent,
  useSaveEvent,
  useSetEventStatus,
  validateEventForm,
  type EventFormErrorCode,
  type EventFormErrors,
  type EventRow,
} from './api'
import { EventPhaseBadge } from './EventPhaseBadge'

type StatusDialogContent = { title: string; body: string; tone: 'default' | 'danger' }

function statusDialogContent(
  pending: StatusOverride,
  current: StatusOverride,
  t: TFunction,
): StatusDialogContent {
  if (pending === 'locked') {
    return { title: t('events.confirmLockTitle'), body: t('events.confirmLockBody'), tone: 'danger' }
  }
  if (pending === 'open') {
    return current === 'locked'
      ? { title: t('events.confirmUnlockTitle'), body: t('events.confirmUnlockBody'), tone: 'default' }
      : { title: t('events.confirmOpenTitle'), body: t('events.confirmOpenBody'), tone: 'default' }
  }
  return { title: t('events.confirmAutoTitle'), body: t('events.confirmAutoBody'), tone: 'default' }
}

/** Name/dates/pitch-length form. Keyed by event id from the parent so switching events
 * remounts it with fresh initial state, instead of syncing props into state via an effect. */
function EventDetailsForm({ event }: { event: EventRow }) {
  const { t } = useTranslation()
  const saveEvent = useSaveEvent()
  const [form, setForm] = useState(() => toEventFormState(event))
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
      await saveEvent.mutateAsync({ ...result.data, id: event.id })
      toast.success(t('events.saved'))
    } catch {
      toast.error(t('events.saveError'))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('events.nameLabel')}</CardTitle>
      </CardHeader>
      <CardBody>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field id="event-name" label={t('events.nameLabel')} error={fieldError(errors.name)}>
            <Input
              id="event-name"
              value={form.name}
              aria-describedby={describedBy('event-name', { error: errors.name })}
              aria-invalid={Boolean(errors.name)}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="event-starts" label={t('events.startsAtLabel')} error={fieldError(errors.startsAt)}>
              <DateTimeField
                id="event-starts"
                value={form.startsAt}
                aria-describedby={describedBy('event-starts', { error: errors.startsAt })}
                aria-invalid={Boolean(errors.startsAt)}
                onChange={(value) => setForm({ ...form, startsAt: value })}
              />
            </Field>
            <Field id="event-ends" label={t('events.endsAtLabel')} error={fieldError(errors.endsAt)}>
              <DateTimeField
                id="event-ends"
                value={form.endsAt}
                aria-describedby={describedBy('event-ends', { error: errors.endsAt })}
                aria-invalid={Boolean(errors.endsAt)}
                onChange={(value) => setForm({ ...form, endsAt: value })}
              />
            </Field>
          </div>

          <Field
            id="event-pitch-minutes"
            label={t('events.pitchMinutesLabel')}
            error={fieldError(errors.pitchMinutes)}
            className="max-w-xs"
          >
            <Input
              id="event-pitch-minutes"
              type="number"
              min={1}
              max={60}
              value={form.pitchMinutes}
              aria-describedby={describedBy('event-pitch-minutes', { error: errors.pitchMinutes })}
              aria-invalid={Boolean(errors.pitchMinutes)}
              onChange={(e) => setForm({ ...form, pitchMinutes: e.target.value })}
            />
          </Field>

          <div>
            <Button type="submit" loading={saveEvent.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}

function ScoringControl({ event }: { event: EventRow }) {
  const { t } = useTranslation()
  const setEventStatus = useSetEventStatus()
  const [pendingStatus, setPendingStatus] = useState<StatusOverride | null>(null)

  async function confirmStatus() {
    if (!pendingStatus) return
    try {
      await setEventStatus.mutateAsync({ eventId: event.id, override: pendingStatus })
    } catch (error) {
      toast.error(t('events.statusError'))
      throw error
    }
  }

  const dialog = pendingStatus ? statusDialogContent(pendingStatus, event.statusOverride, t) : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('events.statusTitle')}</CardTitle>
        <EventPhaseBadge event={event} />
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={event.statusOverride === 'auto' ? 'primary' : 'secondary'}
            disabled={event.statusOverride === 'auto'}
            onClick={() => setPendingStatus('auto')}
          >
            {t('events.statusAuto')}
          </Button>
          <Button
            variant={event.statusOverride === 'open' ? 'primary' : 'secondary'}
            disabled={event.statusOverride === 'open'}
            onClick={() => setPendingStatus('open')}
          >
            {t('events.statusOpen')}
          </Button>
          <Button
            variant={event.statusOverride === 'locked' ? 'primary' : 'secondary'}
            disabled={event.statusOverride === 'locked'}
            onClick={() => setPendingStatus('locked')}
          >
            {t('events.statusLocked')}
          </Button>
        </div>
        <p className="text-sm text-ink-faint">{t('events.statusAutoHint')}</p>
      </CardBody>

      {dialog && pendingStatus && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setPendingStatus(null)
          }}
          title={dialog.title}
          description={dialog.body}
          confirmLabel={t('common.confirm')}
          tone={dialog.tone}
          onConfirm={confirmStatus}
        />
      )}
    </Card>
  )
}

export function EventSettingsPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const { t } = useTranslation()
  const { data: event, isLoading } = useEvent(eventId as Id)

  if (isLoading || !event) {
    return (
      <Page>
        <PageHeader title={<Skeleton className="h-9 w-56" />} />
        <Skeleton className="h-64 w-full" />
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader
        title={event.name}
        description={t('events.settings')}
        actions={
          <Link to="/admin/events" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
            <ArrowLeft aria-hidden />
            {t('common.back')}
          </Link>
        }
      />

      <div className="flex flex-col gap-6">
        <EventDetailsForm key={event.id} event={event} />
        <ScoringControl event={event} />
      </div>
    </Page>
  )
}
