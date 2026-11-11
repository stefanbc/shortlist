import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'
import { controlClasses } from './fieldStyles'

type DateTimeFieldProps = Omit<ComponentProps<'input'>, 'type' | 'value' | 'onChange'> & {
  /** Local date-time in `YYYY-MM-DDTHH:mm` form, or '' when empty. */
  value: string
  onChange(value: string): void
}

export function DateTimeField({ value, onChange, className, ...props }: DateTimeFieldProps) {
  return (
    <input
      type="datetime-local"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        controlClasses,
        'h-11 tabular-nums [&::-webkit-calendar-picker-indicator]:opacity-60 dark:[&::-webkit-calendar-picker-indicator]:invert',
        className,
      )}
      {...props}
    />
  )
}
