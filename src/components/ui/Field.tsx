import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'

type FieldProps = {
  /** id of the control inside; hint/error get `${id}-hint` / `${id}-error` for aria-describedby. */
  id: string
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  optional?: boolean
  /** `text` for a control made of several inputs (a date picker): the label is then a
   * caption with id `${id}-label` rather than a <label> pointing at one input. */
  labelAs?: 'label' | 'text'
  className?: string
  children: ReactNode
}

/** Label + control + hint/error. Give the control `aria-describedby={describedBy(id, …)}` (from fieldStyles). */
export function Field({
  id,
  label,
  hint,
  error,
  optional,
  labelAs = 'label',
  className,
  children,
}: FieldProps) {
  const Label = labelAs === 'label' ? 'label' : 'span'
  const { t } = useTranslation()
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label
        {...(labelAs === 'label' ? { htmlFor: id } : { id: `${id}-label` })}
        className="text-sm font-medium text-ink"
      >
        {label}
        {optional && (
          <span className="ml-1.5 font-normal text-ink-faint">({t('common.optional')})</span>
        )}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-sm text-ink-faint">
            {hint}
          </p>
        )
      )}
    </div>
  )
}
