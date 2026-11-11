import { Gavel, KeyRound, Trash2, UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
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
import { cn } from '@/lib/cn'
import { JurorLinkDialog } from './JurorLinkDialog'
import { useJurorProgress, type JurorProgress } from './jurorProgress'

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
                onValueChange={setJurorId}
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
  progress,
  onRequestRemove,
  onOpenLink,
}: {
  juror: Profile
  progress: JurorProgress
  onRequestRemove(juror: Profile): void
  onOpenLink(juror: Profile): void
}) {
  const { t } = useTranslation()
  const { complete, started, total } = progress
  const done = total > 0 && complete >= total

  return (
    <div className="grid gap-x-6 gap-y-3 px-4 py-3.5 sm:px-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold break-words">{juror.displayName}</span>
          {!juror.active && <Badge tone="danger">{t('users.statusInactive')}</Badge>}
        </div>
        {juror.email && !isPlaceholderEmail(juror.email) && (
          <p className="truncate text-sm text-ink-muted">{juror.email}</p>
        )}
      </div>

      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
          <span className={done ? 'font-semibold text-success' : 'text-ink'}>
            {t('eventJurors.progress', { complete, total })}
          </span>
          {started > 0 && (
            <span className="text-ink-muted">{t('eventJurors.progressStarted', { count: started })}</span>
          )}
        </p>
        <div aria-hidden className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken">
          <div
            className={cn('h-full rounded-full', done ? 'bg-success' : 'bg-accent')}
            style={{ width: `${total > 0 ? (complete / total) * 100 : 0}%` }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <Button variant="secondary" size="sm" className="h-11" onClick={() => onOpenLink(juror)}>
          <KeyRound aria-hidden />
          {t('users.loginLink')}
        </Button>
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
  const [linkJuror, setLinkJuror] = useState<Profile | null>(null)
  const progress = useJurorProgress(id)

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

  const noProgress = progress.get('' as Id) ?? { complete: 0, started: 0, total: 0 }
  const progressOf = (jurorId: Id) => progress.get(jurorId) ?? noProgress
  const finished = assigned.filter((juror) => {
    const { complete, total } = progressOf(juror.id)
    return total > 0 && complete >= total
  }).length

  return (
    <Page>
      <PageHeader
        title={t('events.jurors')}
        actions={
          <>
            <Button onClick={() => setAssignOpen(true)}>
              <UserPlus aria-hidden />
              {t('eventJurors.addJuror')}
            </Button>
          </>
        }
      />

      <h2 className="sr-only">{t('eventJurors.heading')}</h2>
      <div className="flex flex-col gap-4">
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
          <>
            <p className="text-sm text-ink-muted">
              {t('eventJurors.summary', { count: assigned.length, finished })}
            </p>
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {assigned.map((juror) => (
                <li key={juror.id}>
                  <JurorRow
                    juror={juror}
                    progress={progressOf(juror.id)}
                    onRequestRemove={setRemoveTarget}
                    onOpenLink={setLinkJuror}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <JurorLinkDialog
        open={linkJuror !== null}
        onOpenChange={(open) => !open && setLinkJuror(null)}
        juror={linkJuror}
      />

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
