import type { ParseKeys } from 'i18next'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router'
import type { Id } from '@/domain/types'
import { cn } from '@/lib/cn'

const TABS: { segment: string; label: ParseKeys }[] = [
  { segment: 'settings', label: 'events.settings' },
  { segment: 'teams', label: 'events.teams' },
  { segment: 'criteria', label: 'events.criteria' },
  { segment: 'jurors', label: 'events.jurors' },
  { segment: 'reports', label: 'nav.reports' },
]

/** Sub-navigation shown on every page inside one event's area (Ruling R16): without it,
 * Settings was the only one of these screens reachable from the rest of the app. `NavLink`
 * marks the current tab with `aria-current="page"` by default, and -- since none of these
 * five segments is a prefix of another -- a plain (non-`end`) match is enough to keep
 * "Reports" current on its own nested routes (`reports/podium`, `reports/teams/:id`, ...).
 * The bar scrolls horizontally inside itself at phone widths instead of hiding a tab or
 * widening the page. */
export function EventSubNav({ eventId }: { eventId: Id }) {
  const { t } = useTranslation()

  return (
    <div className="border-b border-line bg-surface">
      <nav
        aria-label={t('events.subNavLabel')}
        className="mx-auto w-full max-w-6xl overflow-x-auto px-4 sm:px-6 lg:px-10"
      >
        <div className="flex gap-6">
          {TABS.map(({ segment, label }) => (
            <NavLink
              key={segment}
              to={`/admin/events/${eventId}/${segment}`}
              className={({ isActive }) =>
                cn(
                  'flex h-12 shrink-0 items-center border-b-2 border-transparent text-[0.95rem] font-medium whitespace-nowrap text-ink-muted transition-colors duration-(--duration-fast) hover:text-ink',
                  isActive && 'border-accent font-semibold text-ink',
                )
              }
            >
              {t(label)}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
