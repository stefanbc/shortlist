import type { ParseKeys, TFunction } from 'i18next'
import { ArrowLeft, Check } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Skeleton } from '@/components/ui/Skeleton'
import type { StatusOverride } from '@/domain/eventPhase'
import type { Id } from '@/domain/types'
import { cn } from '@/lib/cn'
import {
  toEventFormState,
  useEvent,
  useSaveEvent,
  useSetEventStatus,
  validateEventForm,
  type EventFormErrors,
  type EventRow,
} from './api'
import { EventFormFields } from './EventFormFields'
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
        <CardTitle>{t('events.detailsTitle')}</CardTitle>
      </CardHeader>
      <CardBody>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <EventFormFields idPrefix="event" form={form} errors={errors} setForm={setForm} />

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

const STATUS_OPTIONS: { value: StatusOverride; label: ParseKeys }[] = [
  { value: 'auto', label: 'events.statusAuto' },
  { value: 'open', label: 'events.statusOpen' },
  { value: 'locked', label: 'events.statusLocked' },
]

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
        <div
          role="group"
          aria-label={t('events.statusTitle')}
          className="grid gap-1 rounded-control bg-sunken p-1 sm:grid-cols-3"
        >
          {STATUS_OPTIONS.map(({ value, label }) => {
            const current = event.statusOverride === value
            return (
              <button
                key={value}
                type="button"
                aria-pressed={current}
                onClick={() => {
                  if (!current) setPendingStatus(value)
                }}
                className={cn(
                  'flex h-11 items-center justify-center gap-2 rounded-[0.25rem] px-3 text-[0.95rem] font-medium text-ink-muted transition-colors duration-(--duration-fast) hover:text-ink',
                  current &&
                    'bg-surface font-semibold text-ink ring-1 ring-line-strong dark:bg-raised',
                )}
              >
                {current && <Check aria-hidden className="size-4" />}
                {t(label)}
              </button>
            )
          })}
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

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <EventDetailsForm key={event.id} event={event} />
        <ScoringControl event={event} />
      </div>
    </Page>
  )
}
