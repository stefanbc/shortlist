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
export function AdminNav({ variant }: { variant: 'sidebar' | 'bar' }) {
  const { t } = useTranslation()
  const sidebar = variant === 'sidebar'

  return (
    <ul className={cn(sidebar ? 'flex flex-col gap-1' : 'grid grid-cols-4')}>
      {items.map(({ to, label, icon: Icon, end }) => (
        <li key={to}>
          <NavLink
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'relative flex items-center rounded-control font-medium transition-colors duration-(--duration-fast)',
                sidebar
                  ? 'h-11 gap-3 px-3 text-[0.95rem]'
                  : 'h-16 flex-col justify-center gap-1 text-[0.7rem]',
                isActive ? 'text-ink' : 'text-ink-muted hover:text-ink',
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
                      'absolute',
                      sidebar
                        ? 'inset-0 rounded-control bg-raised ring-1 ring-line'
                        : 'top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-accent',
                    )}
                  />
                )}
                <Icon
                  aria-hidden
                  className={cn('relative size-5', isActive && 'text-accent-ink')}
                  strokeWidth={isActive ? 2.25 : 1.75}
                />
                <span className="relative">{t(label)}</span>
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}
