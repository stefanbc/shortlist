import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Standard page frame inside the shell: left-aligned, generous gutters, readable max width. */
export function Page({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10', className)}>
      {children}
    </div>
  )
}

type PageHeaderProps = {
  title: ReactNode
  description?: ReactNode
  /** Page-level actions, right-aligned on wide screens. */
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      {typeof title === 'string' && <title>{`${title} | Shortlist`}</title>}
      <div className="min-w-0">
        <h1 className="text-2xl break-words sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-prose text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
