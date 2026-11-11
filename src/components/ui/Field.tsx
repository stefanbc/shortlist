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
  className?: string
  children: ReactNode
}

/** Label + control + hint/error. Give the control `aria-describedby={describedBy(id, …)}` (from fieldStyles). */
export function Field({ id, label, hint, error, optional, className, children }: FieldProps) {
  const { t } = useTranslation()
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {optional && (
          <span className="ml-1.5 font-normal text-ink-faint">({t('common.optional')})</span>
        )}
      </label>
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
