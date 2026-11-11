import { ListChecks, Plus, Trash2 } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { SortableList } from '@/components/ui/SortableList'
import { criterionInputSchema } from '@/domain/schemas'
import type { Criterion, Id } from '@/domain/types'
import { eventPhase } from '@/domain/eventPhase'
import { useEvent } from '@/features/events/api'
import {
  nextPosition,
  shareOfTotal,
  useCriteria,
  useDeleteCriterion,
  useReorderCriteria,
  useSaveCriterion,
} from './api'
import { ThemesPanel } from './ThemesPanel'

/** An in-flight criterion change that needs the organizer to confirm before it's sent,
 * because scoring has already started and rankings will recalculate. */
type PendingAction =
  | { kind: 'weight'; id: Id; name: string; position: number; weight: number; revert(): void }
  | { kind: 'delete'; criterion: Criterion }
  | { kind: 'add'; name: string; weight: number; position: number }

function CriterionRow({
  criterion,
  totalWeight,
  onCommitName,
  onRequestWeight,
  onRequestDelete,
}: {
  criterion: Criterion
  totalWeight: number
  onCommitName(id: Id, name: string): void
  onRequestWeight(criterion: Criterion, weight: number, revert: () => void): void
  onRequestDelete(criterion: Criterion): void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(criterion.name)
  const [weightText, setWeightText] = useState(String(criterion.weight))
  const [weightError, setWeightError] = useState<string>()
  const [lastSyncedWeight, setLastSyncedWeight] = useState(criterion.weight)

  // Adjusts the field during render when the server's value changes under us (a
  // refetch after this or another admin's edit) -- React's documented pattern for
  // resetting state from a prop change, which avoids the extra render a useEffect
  // would cost (and that pattern is a lint error here: react-hooks/set-state-in-effect).
  if (criterion.weight !== lastSyncedWeight) {
    setLastSyncedWeight(criterion.weight)
    setWeightText(String(criterion.weight))
  }

  function commitName() {
    const trimmed = name.trim()
    if (!trimmed) {
      setName(criterion.name)
      return
    }
    if (trimmed === criterion.name) return
    onCommitName(criterion.id, trimmed)
  }

  function commitWeight() {
    const parsed = Number(weightText)
    const result = criterionInputSchema.shape.weight.safeParse(parsed)
    if (!result.success) {
      setWeightError(t('criteria.weightRequired'))
      return
    }
    setWeightError(undefined)
    if (result.data === criterion.weight) return

    onRequestWeight(criterion, result.data, () => setWeightText(String(criterion.weight)))
  }

  const percent = shareOfTotal(criterion.weight, totalWeight)

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Input
          aria-label={t('criteria.nameLabel')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          className="h-11 min-w-0 basis-full sm:basis-0 sm:flex-1"
        />
        <Input
          aria-label={`${t('criteria.weightLabel')}: ${criterion.name}`}
          type="number"
          min={0}
          step="any"
          value={weightText}
          onChange={(e) => setWeightText(e.target.value)}
          onBlur={commitWeight}
          aria-invalid={Boolean(weightError)}
          className="h-11 w-24 shrink-0 text-right"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`${t('criteria.deleteCriterion')}: ${criterion.name}`}
          onClick={() => onRequestDelete(criterion)}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
      {/* Its own line, not a sibling squeezed into the row above, so the share-of-total
          bar stays visible on phones instead of only appearing from a desktop breakpoint. */}
      <div className="flex items-center gap-2 pl-1">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-raised" aria-hidden>
          <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
        </div>
        <span className="w-9 shrink-0 text-right text-sm text-ink-faint">{percent}%</span>
      </div>
      {weightError && <p className="text-sm text-danger">{weightError}</p>}
    </div>
  )
}

function AddCriterionForm({
  nextPosition,
  onRequestAdd,
}: {
  nextPosition: number
  onRequestAdd(name: string, weight: number, position: number): void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [weightText, setWeightText] = useState('')
  const [errors, setErrors] = useState<{ name?: string; weight?: string }>({})

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const result = criterionInputSchema.safeParse({
      name,
      weight: Number(weightText),
      position: nextPosition,
    })
    if (!result.success) {
      const next: { name?: string; weight?: string } = {}
      for (const issue of result.error.issues) {
        if (issue.path[0] === 'name') next.name = t('criteria.nameRequired')
        if (issue.path[0] === 'weight') next.weight = t('criteria.weightRequired')
      }
      setErrors(next)
      return
    }
    setErrors({})
    onRequestAdd(result.data.name, result.data.weight, result.data.position)
    setName('')
    setWeightText('')
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Input
          aria-label={t('criteria.nameLabel')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={Boolean(errors.name)}
          className="h-11 min-w-0 basis-full sm:basis-0 sm:flex-1"
        />
        <Input
          aria-label={t('criteria.weightLabel')}
          type="number"
          min={0}
          step="any"
          value={weightText}
          onChange={(e) => setWeightText(e.target.value)}
          aria-invalid={Boolean(errors.weight)}
          className="h-11 w-24 shrink-0 text-right"
        />
        <Button type="submit" variant="secondary" size="sm">
          <Plus aria-hidden />
          {t('criteria.addCriterion')}
        </Button>
      </div>
      {(errors.name ?? errors.weight) && (
        <p className="text-sm text-danger">{errors.name ?? errors.weight}</p>
      )}
    </form>
  )
}

function CriteriaSection({ eventId, requiresConfirm }: { eventId: Id; requiresConfirm: boolean }) {
  const { t } = useTranslation()
  const { data: criteria, isLoading } = useCriteria(eventId)
  const saveCriterion = useSaveCriterion()
  const deleteCriterion = useDeleteCriterion()
  const reorderCriteria = useReorderCriteria(eventId)
  const [pending, setPending] = useState<PendingAction | null>(null)
  // ConfirmDialog closes itself (calls onOpenChange(false)) both after a successful
  // confirm and on cancel. A ref -- not a stale render's `pending` state -- is what
  // distinguishes them: it's set synchronously right before that close happens, so
  // handleDialogOpenChange always reads the current value regardless of which render's
  // closure invoked it.
  const skipRevertRef = useRef(false)

  const totalWeight = (criteria ?? []).reduce((sum, c) => sum + c.weight, 0)

  async function commitName(id: Id, name: string) {
    const criterion = criteria?.find((c) => c.id === id)
    if (!criterion) return
    try {
      await saveCriterion.mutateAsync({
        id,
        eventId,
        name,
        weight: criterion.weight,
        position: criterion.position,
      })
    } catch {
      toast.error(t('criteria.saveError'))
    }
  }

  function requestWeight(criterion: Criterion, weight: number, revert: () => void) {
    if (requiresConfirm) {
      setPending({
        kind: 'weight',
        id: criterion.id,
        name: criterion.name,
        position: criterion.position,
        weight,
        revert,
      })
      return
    }
    void saveCriterion
      .mutateAsync({
        id: criterion.id,
        eventId,
        name: criterion.name,
        weight,
        position: criterion.position,
      })
      .catch(() => {
        revert()
        toast.error(t('criteria.saveError'))
      })
  }

  function requestDelete(criterion: Criterion) {
    if (requiresConfirm) {
      setPending({ kind: 'delete', criterion })
      return
    }
    void deleteCriterion.mutateAsync({ id: criterion.id, eventId }).catch(() => {
      toast.error(t('criteria.deleteError'))
    })
  }

  function requestAdd(name: string, weight: number, position: number) {
    if (requiresConfirm) {
      setPending({ kind: 'add', name, weight, position })
      return
    }
    void saveCriterion.mutateAsync({ eventId, name, weight, position }).catch(() => {
      toast.error(t('criteria.saveError'))
    })
  }

  async function confirmPending() {
    if (!pending) return
    if (pending.kind === 'weight') {
      try {
        await saveCriterion.mutateAsync({
          id: pending.id,
          eventId,
          name: pending.name,
          weight: pending.weight,
          position: pending.position,
        })
        // Saved: the dialog's own close-on-success must not trigger a revert.
        skipRevertRef.current = true
      } catch (error) {
        pending.revert()
        toast.error(t('criteria.saveError'))
        throw error
      }
    } else if (pending.kind === 'delete') {
      try {
        await deleteCriterion.mutateAsync({ id: pending.criterion.id, eventId })
      } catch (error) {
        toast.error(t('criteria.deleteError'))
        throw error
      }
    } else {
      try {
        await saveCriterion.mutateAsync({
          eventId,
          name: pending.name,
          weight: pending.weight,
          position: pending.position,
        })
      } catch (error) {
        toast.error(t('criteria.saveError'))
        throw error
      }
    }
  }

  function handleDialogOpenChange(open: boolean) {
    if (open) return
    if (pending?.kind === 'weight' && !skipRevertRef.current) pending.revert()
    skipRevertRef.current = false
    setPending(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('criteria.criteriaHeading')}</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <p className="text-sm text-ink-muted">{t('criteria.criteriaDescription')}</p>

        {isLoading && <Skeleton className="h-40 w-full" />}

        {!isLoading && criteria && criteria.length === 0 && (
          <EmptyState icon={ListChecks} title={t('criteria.criteriaEmpty')} />
        )}

        {!isLoading && criteria && criteria.length > 0 && (
          <SortableList
            items={criteria}
            onReorder={(orderedIds) => reorderCriteria.mutate(orderedIds)}
            renderItem={(criterion) => (
              <CriterionRow
                criterion={criterion}
                totalWeight={totalWeight}
                onCommitName={commitName}
                onRequestWeight={requestWeight}
                onRequestDelete={requestDelete}
              />
            )}
          />
        )}

        <AddCriterionForm nextPosition={nextPosition(criteria ?? [])} onRequestAdd={requestAdd} />
      </CardBody>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={handleDialogOpenChange}
        title={t('criteria.confirmTitle')}
        description={t('criteria.confirmBody')}
        confirmLabel={t('common.confirm')}
        onConfirm={confirmPending}
      />
    </Card>
  )
}

export function CriteriaPage() {
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

  const requiresConfirm = eventPhase(event, new Date()) !== 'setup'

  return (
    <Page>
      <PageHeader
        title={t('events.criteria')}
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <CriteriaSection eventId={event.id} requiresConfirm={requiresConfirm} />
        <ThemesPanel eventId={event.id} />
      </div>
    </Page>
  )
}
