import { Activity, CalendarRange, FileUp, Users, type LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { NavLink } from 'react-router'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'

type NavItem = {
  to: string
  label: 'nav.dashboard' | 'nav.events' | 'nav.users' | 'nav.import'
  icon: LucideIcon
  end?: boolean
}

const items: NavItem[] = [
  { to: '/admin', label: 'nav.dashboard', icon: Activity, end: true },
  { to: '/admin/events', label: 'nav.events', icon: CalendarRange },
  { to: '/admin/users', label: 'nav.users', icon: Users },
  { to: '/admin/import', label: 'nav.import', icon: FileUp },
]

/** Organizer navigation. `sidebar` = vertical list (desktop), `bar` = bottom tab bar (mobile). */
export function AdminNav({
  variant,
  collapsed = false,
}: {
  variant: 'sidebar' | 'bar'
  /** Sidebar only: icons without labels (the label stays available to screen readers). */
  collapsed?: boolean
}) {
  const { t } = useTranslation()
  const sidebar = variant === 'sidebar'

  return (
    <ul className={cn(sidebar ? 'flex flex-col gap-1' : 'grid grid-cols-4')}>
      {items.map(({ to, label, icon: Icon, end }) => (
        <li key={to}>
          <NavLink
            to={to}
            end={end}
            title={sidebar && collapsed ? t(label) : undefined}
            className={({ isActive }) =>
              cn(
                'relative flex items-center font-medium transition-colors duration-(--duration-fast)',
                sidebar
                  ? cn('h-11 gap-3 rounded-control text-[0.95rem]', collapsed ? 'justify-center' : 'px-3')
                  : 'h-16 flex-col justify-center gap-1 text-xs',
                sidebar
                  ? isActive
                    ? 'font-semibold text-on-mark'
                    : 'text-rail-muted hover:bg-white/5 hover:text-rail-ink'
                  : isActive
                    ? 'font-semibold text-ink'
                    : 'text-ink-muted hover:text-ink',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId={`admin-nav-${variant}`}
                    transition={{ type: 'spring', stiffness: 520, damping: 42 }}
                    className={cn(
                      'marked absolute',
                      sidebar ? 'inset-0' : 'top-[0.5625rem] left-1/2 h-[1.625rem] w-14 -translate-x-1/2',
                    )}
                  />
                )}
                <Icon
                  aria-hidden
                  className={cn('relative size-5', isActive && 'text-on-mark')}
                  strokeWidth={isActive ? 2.25 : 1.75}
                />
                <span className={sidebar && collapsed ? 'sr-only' : 'relative'}>{t(label)}</span>
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}
