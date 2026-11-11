import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { Criterion } from '@/domain/types'
import { cn } from '@/lib/cn'
import { cellLabel, formatScore, type CellView } from './cells'

type CriterionStripProps = {
  criteria: Criterion[]
  cells: CellView[]
  currentIndex: number
  onSelect(index: number): void
}

/** Phone navigation: one tile per criterion with its score; tap a tile to jump to it. */
export function CriterionStrip({ criteria, cells, currentIndex, onSelect }: CriterionStripProps) {
  const { t, i18n } = useTranslation()
  const listRef = useRef<HTMLOListElement>(null)

  // Keep the current tile in view as the juror moves through the criteria.
  useEffect(() => {
    const tile = listRef.current?.children[currentIndex] as HTMLElement | undefined
    tile?.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [currentIndex])

  return (
    <nav aria-label={t('scoring.criteriaNav')} className="-mx-4">
      <ol
        ref={listRef}
        className="flex snap-x gap-1.5 overflow-x-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {criteria.map((criterion, index) => {
          const cell = cells[index]
          const current = index === currentIndex
          const value =
            'value' in cell && cell.value !== null ? formatScore(cell.value, i18n.language) : '–'
          return (
            <li key={criterion.id} className="snap-center">
              <button
                type="button"
                onClick={() => onSelect(index)}
                aria-current={current ? 'step' : undefined}
                aria-label={cellLabel(t, i18n.language, criterion, index + 1, cell)}
                className={cn(
                  'relative flex h-14 w-12 flex-col items-center justify-center rounded-control bg-surface ring-1 ring-line transition-[box-shadow,background-color] duration-(--duration-fast)',
                  current && 'ring-2 ring-ink',
                  cell.state === 'rejected' && 'bg-danger-soft ring-danger/60',
                )}
              >
                <span aria-hidden className="text-[0.7rem] leading-none text-ink-faint">
                  {index + 1}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    'numeral mt-1 text-lg leading-none',
                    cell.state === 'empty' && 'text-ink-faint',
                    (cell.state === 'saved' || cell.state === 'pending') && 'text-accent-ink',
                    cell.state === 'rejected' && 'text-danger line-through',
                  )}
                >
                  {value}
                </span>
                {cell.state === 'pending' && (
                  <span
                    aria-hidden
                    className="absolute top-1.5 right-1.5 size-1.5 animate-pulse rounded-full bg-warning"
                  />
                )}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
