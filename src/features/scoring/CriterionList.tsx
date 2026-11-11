import { useTranslation } from 'react-i18next'
import type { Criterion } from '@/domain/types'
import { cn } from '@/lib/cn'
import { cellLabel, formatScore, type CellView } from './cells'

type CriterionListProps = {
  criteria: Criterion[]
  cells: CellView[]
  currentIndex: number
  onSelect(index: number): void
}

/** Laptop/tablet navigation: every criterion with its score, beside the focused card. */
export function CriterionList({ criteria, cells, currentIndex, onSelect }: CriterionListProps) {
  const { t, i18n } = useTranslation()
  return (
    <nav aria-label={t('scoring.criteriaNav')}>
      <ol className="flex flex-col gap-1">
        {criteria.map((criterion, index) => {
          const cell = cells[index]
          const current = index === currentIndex
          const value =
            'value' in cell && cell.value !== null ? formatScore(cell.value, i18n.language) : '–'
          return (
            <li key={criterion.id}>
              <button
                type="button"
                onClick={() => onSelect(index)}
                aria-current={current ? 'step' : undefined}
                aria-label={cellLabel(t, i18n.language, criterion, index + 1, cell)}
                className={cn(
                  'flex min-h-12 w-full items-center gap-3 rounded-control px-3 py-2 text-left text-sm text-ink-muted transition-colors duration-(--duration-fast) hover:bg-raised hover:text-ink',
                  current && 'bg-surface font-semibold text-ink ring-1 ring-ink hover:bg-surface',
                  cell.state === 'rejected' && 'ring-1 ring-danger/60',
                )}
              >
                <span aria-hidden className="w-4 shrink-0 text-xs text-ink-faint tabular-nums">
                  {index + 1}
                </span>
                <span aria-hidden className="min-w-0 flex-1 leading-snug">
                  {criterion.name}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    'numeral flex shrink-0 items-center gap-1.5 text-base',
                    cell.state === 'empty' && 'text-ink-faint',
                    (cell.state === 'saved' || cell.state === 'pending') && 'text-accent-ink',
                    cell.state === 'rejected' && 'text-danger line-through',
                  )}
                >
                  {cell.state === 'pending' && (
                    <span className="size-1.5 animate-pulse rounded-full bg-warning" />
                  )}
                  {value}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
