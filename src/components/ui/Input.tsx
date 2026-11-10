import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'
import { controlClasses } from './fieldStyles'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(controlClasses, 'h-11', className)} {...props} />
}
