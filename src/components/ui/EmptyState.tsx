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

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-panel border border-dashed border-line-strong px-6 py-14 text-center',
        className,
      )}
    >
      <div className="mb-5 grid size-14 place-items-center rounded-card bg-accent-soft text-accent-ink">
        <Icon aria-hidden className="size-6" strokeWidth={1.75} />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="mt-1.5 max-w-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
