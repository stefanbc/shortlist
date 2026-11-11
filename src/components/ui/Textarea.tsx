import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'
import { controlClasses } from './fieldStyles'

export function Textarea({ className, rows = 4, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      rows={rows}
      className={cn(controlClasses, 'min-h-24 resize-y py-2.5', className)}
      {...props}
    />
  )
}
