import { ChevronLeft, ChevronRight, CircleAlert, Lock, Eraser } from 'lucide-react'
import { motion, useReducedMotion, type PanInfo } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import type { Criterion } from '@/domain/types'
import { cn } from '@/lib/cn'
import { formatScore, SCORE_VALUES, type CellView } from './cells'

/** How far (px) or fast (px/s) a horizontal swipe must go to change criterion. */
const SWIPE_DISTANCE = 64
const SWIPE_VELOCITY = 450

type CriterionCardProps = {
  criterion: Criterion
  /** 1-based position among the criteria. */
  n: number
  total: number
  cell: CellView
  /** Why scoring is off right now; null while it's on. */
  disabledReason: string | null
  /** Phone: swipe the card left/right to move. */
  swipeable: boolean
  /** -1 when the juror moved back, 1 when forward: the side the card slides in from. */
  direction: number
  onPick(value: number): void
  onClear(): void
  onPrev(): void
  onNext(): void
}

/** The focused criterion: its name, weight, big current value and the nine score buttons. */
export function CriterionCard({
  criterion,
  n,
  total,
  cell,
  disabledReason,
  swipeable,
  direction,
  onPick,
  onClear,
  onPrev,
  onNext,
}: CriterionCardProps) {
  const { t, i18n } = useTranslation()
  const reduceMotion = useReducedMotion()
  const value = 'value' in cell ? cell.value : null
  const disabled = disabledReason !== null

  function onDragEnd(_event: unknown, info: PanInfo) {
    if (info.offset.x < -SWIPE_DISTANCE || info.velocity.x < -SWIPE_VELOCITY) onNext()
    else if (info.offset.x > SWIPE_DISTANCE || info.velocity.x > SWIPE_VELOCITY) onPrev()
  }

  return (
    <motion.section
      key={criterion.id}
      aria-labelledby={`criterion-${criterion.id}`}
      initial={reduceMotion ? false : { opacity: 0, x: direction * 28 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      drag={swipeable ? 'x' : false}
      dragDirectionLock
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.22}
      dragSnapToOrigin
      onDragEnd={onDragEnd}
      className="rounded-panel bg-surface p-5 ring-1 ring-line sm:p-7"
    >
      <div className="flex items-baseline justify-between gap-3 text-sm text-ink-muted">
        <span>{t('scoring.criterionPosition', { n, total })}</span>
        <span className="tabular-nums">{t('scoring.weight', { weight: criterion.weight })}</span>
      </div>
      <h2
        id={`criterion-${criterion.id}`}
        className="mt-2 text-xl leading-tight font-semibold sm:text-2xl"
      >
        {criterion.name}
      </h2>

      <div
        className="my-3 flex h-24 items-center md:my-5 md:h-28 justify-center md:justify-start"
        aria-live="polite"
      >
        {value === null ? (
          <span className="numeral text-[6.5rem] leading-none text-line-strong">
            <span aria-hidden>–</span>
            <span className="sr-only">{t('scoring.noScore')}</span>
          </span>
        ) : (
          <motion.span
            key={value}
            initial={reduceMotion ? false : { scale: 0.86, opacity: 0.4 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 520, damping: 30 }}
            className={cn(
              'numeral text-[7rem] leading-none',
              cell.state === 'rejected' ? 'text-danger line-through decoration-4' : 'text-ink',
            )}
          >
            {formatScore(value, i18n.language)}
          </motion.span>
        )}
      </div>

      {cell.state === 'rejected' && (
        <p className="mb-4 flex gap-2 rounded-control bg-danger-soft px-3 py-2.5 text-sm text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t(`scoring.rejected.${cell.reason}`)}
        </p>
      )}

      {disabled && (
        <p className="mb-4 flex gap-2 rounded-control bg-raised px-3 py-2.5 text-sm text-ink-muted">
          <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
          {disabledReason}
        </p>
      )}

      <div
        role="group"
        aria-label={t('scoring.scoreButtons', { criterion: criterion.name })}
        className="grid grid-cols-5 gap-1.5 md:grid-cols-9"
      >
        {SCORE_VALUES.map((v) => {
          const selected = v === value
          return (
            <button
              key={v}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => onPick(v)}
              className={cn(
                'numeral h-14 rounded-control text-xl ring-1 ring-inset transition-[background-color,box-shadow,transform] duration-(--duration-fast) active:scale-[0.94]',
                'disabled:pointer-events-none disabled:opacity-40',
                selected
                  ? cell.state === 'rejected'
                    ? 'bg-danger text-white ring-danger'
                    : 'bg-accent text-on-accent shadow-glow ring-accent'
                  : 'bg-raised text-ink ring-line hover:ring-line-strong',
              )}
            >
              {formatScore(v, i18n.language)}
            </button>
          )
        })}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          onClick={onClear}
          disabled={disabled || value === null}
          className="-ml-2"
        >
          <Eraser aria-hidden />
          {t('scoring.clear')}
        </Button>
        <div className="flex gap-1">
          <Button
            variant="secondary"
            size="icon"
            onClick={onPrev}
            disabled={n === 1}
            aria-label={t('scoring.previous')}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            onClick={onNext}
            disabled={n === total}
            aria-label={t('scoring.next')}
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </div>
    </motion.section>
  )
}
