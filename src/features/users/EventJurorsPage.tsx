import { ArrowLeft, Gavel, Trash2, UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { Page, PageHeader } from '@/components/layout/Page'
import type { Id } from '@/domain/types'
import { useEvent } from '@/features/events/api'
import type { Profile } from '@/stores/session'
import { isPlaceholderEmail, useAssignJuror, useEventJurors, useProfiles, useUnassignJuror } from './api'

function AssignJurorDialog({
  open,
  onOpenChange,
  eventId,
  candidates,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  eventId: Id
  candidates: Profile[]
}) {
  const { t } = useTranslation()
  const assignJuror = useAssignJuror()
  const [jurorId, setJurorId] = useState('')

  function handleOpenChange(next: boolean) {
    if (!next) setJurorId('')
    onOpenChange(next)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!jurorId) return
    try {
      await assignJuror.mutateAsync({ eventId, jurorId: jurorId as Id })
      toast.success(t('eventJurors.assigned'))
      handleOpenChange(false)
    } catch {
      toast.error(t('eventJurors.assignError'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        title={t('eventJurors.addDialogTitle')}
        description={t('eventJurors.addDialogDescription')}
      >
        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          {candidates.length === 0 ? (
            <p className="text-sm text-ink-muted">{t('eventJurors.pickerEmpty')}</p>
          ) : (
            <Field id="assign-juror-picker" label={t('eventJurors.pickerLabel')}>
              <Select
                id="assign-juror-picker"
                value={jurorId}
                onChange={(e) => setJurorId(e.target.value)}
                autoFocus
              >
                <option value="">{t('eventJurors.pickerPlaceholder')}</option>
                {candidates.map((juror) => (
                  <option key={juror.id} value={juror.id}>
                    {juror.displayName}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <DialogFooter>
            <Button type="submit" disabled={!jurorId} loading={assignJuror.isPending}>
              {t('eventJurors.addJuror')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function JurorRow({
  juror,
  onRequestRemove,
}: {
  juror: Profile
  onRequestRemove(juror: Profile): void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-semibold">{juror.displayName}</span>
          {!juror.active && <Badge tone="danger">{t('users.statusInactive')}</Badge>}
        </div>
        {juror.email && !isPlaceholderEmail(juror.email) && (
          <p className="truncate text-sm text-ink-muted">{juror.email}</p>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`${t('eventJurors.remove')}: ${juror.displayName}`}
        onClick={() => onRequestRemove(juror)}
      >
        <Trash2 aria-hidden />
      </Button>
    </div>
  )
}

export function EventJurorsPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const { t } = useTranslation()
  const id = eventId as Id

  const { data: event, isLoading: eventLoading } = useEvent(id)
  const { data: assignedJurors, isLoading: jurorsLoading } = useEventJurors(id)
  const { data: profiles } = useProfiles()
  const unassignJuror = useUnassignJuror()

  const [assignOpen, setAssignOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<Profile | null>(null)

  if (eventLoading || !event) {
    return (
      <Page>
        <PageHeader title={<Skeleton className="h-9 w-56" />} />
        <Skeleton className="h-64 w-full" />
      </Page>
    )
  }

  const assigned = assignedJurors ?? []
  const assignedIds = new Set(assigned.map((juror) => juror.id))
  const candidates = (profiles ?? []).filter(
    (profile) => profile.role === 'juror' && profile.active && !assignedIds.has(profile.id),
  )

  async function confirmRemove() {
    if (!removeTarget) return
    try {
      await unassignJuror.mutateAsync({ eventId: id, jurorId: removeTarget.id })
    } catch (error) {
      toast.error(t('eventJurors.removeError'))
      throw error
    }
  }

  return (
    <Page>
      <PageHeader
        title={t('events.jurors')}
        description={event.name}
        actions={
          <>
            <Link
              to={`/admin/events/${event.id}/settings`}
              className={buttonClasses({ variant: 'secondary', size: 'sm' })}
            >
              <ArrowLeft aria-hidden />
              {t('common.back')}
            </Link>
            <Button onClick={() => setAssignOpen(true)}>
              <UserPlus aria-hidden />
              {t('eventJurors.addJuror')}
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('eventJurors.heading')}</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          {jurorsLoading && <Skeleton className="h-40 w-full" />}

          {!jurorsLoading && assigned.length === 0 && (
            <EmptyState
              icon={Gavel}
              title={t('eventJurors.emptyTitle')}
              description={t('eventJurors.emptyDescription')}
              action={
                <Button onClick={() => setAssignOpen(true)}>
                  <UserPlus aria-hidden />
                  {t('eventJurors.addJuror')}
                </Button>
              }
            />
          )}

          {!jurorsLoading && assigned.length > 0 && (
            <ul className="flex flex-col divide-y divide-line">
              {assigned.map((juror) => (
                <li key={juror.id}>
                  <JurorRow juror={juror} onRequestRemove={setRemoveTarget} />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <AssignJurorDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        eventId={id}
        candidates={candidates}
      />

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title={t('eventJurors.confirmRemoveTitle', { name: removeTarget?.displayName ?? '' })}
        description={t('eventJurors.confirmRemoveBody', { name: removeTarget?.displayName ?? '' })}
        confirmLabel={t('eventJurors.remove')}
        tone="danger"
        onConfirm={confirmRemove}
      />
    </Page>
  )
}
