import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type EmptyStateProps = {
  icon: LucideIcon
  title: ReactNode
  description?: ReactNode
  /** Usually a Button that resolves the emptiness. */
  action?: ReactNode
  className?: string
}

/** A blank stretch of the list: says what belongs here and how to add it. */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('py-6 sm:py-8', className)}>
      <Icon aria-hidden className="mb-4 size-7 text-ink-faint" strokeWidth={1.5} />
      <h2 className="text-xl font-semibold">{title}</h2>
      {description && <p className="mt-1.5 max-w-md text-ink-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
