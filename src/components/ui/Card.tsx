import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('min-w-0 rounded-card border border-line bg-surface', className)} {...props} />
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('flex items-start justify-between gap-4 p-5 pb-0', className)} {...props} />
  )
}

export function CardTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 className={cn('text-lg font-semibold', className)} {...props} />
}

export function CardBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('p-5', className)} {...props} />
}
