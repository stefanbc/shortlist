import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Sheet, SheetContent } from '@/components/ui/Sheet'
import { SortableList } from '@/components/ui/SortableList'
import type { Id } from '@/domain/types'
import { useSetTiebreakOrder, type TeamWithProject } from '@/features/teams/api'

function TieBreakOrderForm({
  eventId,
  teams,
  onDone,
}: {
  eventId: Id
  teams: TeamWithProject[]
  onDone(): void
}) {
  const { t } = useTranslation()
  const [order, setOrder] = useState(teams)
  const setTiebreakOrder = useSetTiebreakOrder(eventId)

  function reorder(orderedIds: Id[]) {
    const byId = new Map(order.map((team) => [team.id, team]))
    setOrder(orderedIds.map((id) => byId.get(id)!))
  }

  async function save() {
    try {
      await setTiebreakOrder.mutateAsync(order.map((team) => team.id))
      toast.success(t('reports.tieBreak.saved'))
      onDone()
    } catch {
      toast.error(t('reports.tieBreak.saveError'))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SortableList
        items={order}
        onReorder={reorder}
        renderItem={(team) => (
          <div className="flex items-center gap-3 py-1">
            <span className="numeral w-6 shrink-0 text-right text-lg text-ink-faint">
              {order.findIndex((t) => t.id === team.id) + 1}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">{team.name}</span>
          </div>
        )}
      />
      <Button onClick={() => void save()} loading={setTiebreakOrder.isPending}>
        {t('common.save')}
      </Button>
    </div>
  )
}

type TieBreakDialogProps = {
  eventId: Id
  open: boolean
  onOpenChange(open: boolean): void
  /** The tied group, in a stable starting order. */
  teams: TeamWithProject[]
}

/** Lets the organizer set the manual order for an entire tied group at once -- never one
 * team at a time -- so the partial state `rankTeams`' comparator has to account for (only
 * some tied teams given an order) never arises from this UI. Keyed by the group's team ids
 * so opening a different tie starts the drag list fresh instead of carrying over state. */
export function TieBreakDialog({ eventId, open, onOpenChange, teams }: TieBreakDialogProps) {
  const { t } = useTranslation()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={t('reports.tieBreak.title')}
        description={t('reports.tieBreak.description', { count: teams.length })}
      >
        {open && (
          <TieBreakOrderForm
            key={teams.map((team) => team.id).join(',')}
            eventId={eventId}
            teams={teams}
            onDone={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
