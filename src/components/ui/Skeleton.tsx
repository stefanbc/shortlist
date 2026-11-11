import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-shimmer rounded-control bg-[linear-gradient(90deg,var(--raised)_0%,var(--sunken)_50%,var(--raised)_100%)] bg-size-[200%_100%]',
        className,
      )}
      {...props}
    />
  )
}
