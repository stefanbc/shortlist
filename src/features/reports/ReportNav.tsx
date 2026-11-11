import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router'
import type { ParseKeys } from 'i18next'
import { cn } from '@/lib/cn'
import type { Id } from '@/domain/types'

const TABS: { segment: string; label: ParseKeys }[] = [
  { segment: 'podium', label: 'reports.podium' },
  { segment: 'ranking', label: 'reports.ranking' },
  { segment: 'criteria', label: 'reports.criteria' },
  { segment: 'jurors', label: 'reports.jurors' },
]

/** Tab strip between the four report routes (team breakdown is reached from the ranking
 * table, not from here -- it's about one team, not the event). Visually matches the shared
 * `Tabs` component, but built on `NavLink` since each tab is its own route, not a panel. */
export function ReportNav({ eventId }: { eventId: Id }) {
  const { t } = useTranslation()

  return (
    <nav aria-label={t('nav.reports')} className="mb-6 -mx-1 overflow-x-auto px-1">
      <div className="inline-flex max-w-full gap-1 rounded-card bg-sunken/70 p-1 ring-1 ring-inset ring-line">
        {TABS.map(({ segment, label }) => (
          <NavLink
            key={segment}
            to={`/admin/events/${eventId}/reports/${segment}`}
            className={({ isActive }) =>
              cn(
                'flex h-9 shrink-0 items-center rounded-control px-3.5 text-sm font-medium whitespace-nowrap text-ink-muted transition-colors duration-(--duration-fast) hover:text-ink',
                isActive && 'bg-surface text-ink shadow-pop dark:bg-line',
              )
            }
          >
            {t(label)}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
