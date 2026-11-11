import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'

type SortableListProps<T extends { id: string }> = {
  items: T[]
  renderItem(item: T): ReactNode
  /** Called with every item's id in its new order once a drag (pointer or keyboard) completes. */
  onReorder(orderedIds: string[]): void
  className?: string
}

/** Generic drag-to-reorder list: a grip handle per row drives both pointer and keyboard
 * reordering (@dnd-kit's KeyboardSensor — focus the handle, Space to pick up, arrow keys to
 * move, Space to drop). Reused by criteria, themes (Task 10) and teams (Task 11). */
export function SortableList<T extends { id: string }>({
  items,
  renderItem,
  onReorder,
  className,
}: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((item) => item.id === active.id)
    const newIndex = items.findIndex((item) => item.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    onReorder(arrayMove(items, oldIndex, newIndex).map((item) => item.id))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <ul
          className={cn(
            'divide-y divide-line overflow-hidden rounded-card border border-line bg-surface',
            className,
          )}
        >
          {items.map((item) => (
            <SortableRow key={item.id} id={item.id}>
              {renderItem(item)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function SortableRow({ id, children }: { id: string; children: ReactNode }) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-1 bg-surface',
        isDragging && 'relative z-10 rounded-control shadow-pop ring-1 ring-ink',
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t('common.dragHandle')}
        className="flex h-11 w-11 shrink-0 touch-none items-center justify-center rounded-control text-ink-faint hover:text-ink focus-visible:outline-2 focus-visible:outline-accent active:cursor-grabbing"
      >
        <GripVertical aria-hidden className="size-4" />
      </button>
      <div className="min-w-0 flex-1 py-1.5 pr-2">{children}</div>
    </li>
  )
}
