import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Link, Outlet } from 'react-router'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { usePreferences } from '@/stores/preferences'
import { AdminNav } from './AdminNav'
import { BrandMark } from './BrandMark'
import { PreferencesMenu } from './PreferencesMenu'

type AppShellProps = {
  /**
   * `admin`: sidebar on desktop; top bar + bottom tab bar on mobile.
   * `juror`: a single slim top bar everywhere, so scoring keeps the whole screen.
   */
  section: 'admin' | 'juror'
}

export function AppShell({ section }: AppShellProps) {
  const { t } = useTranslation()
  const admin = section === 'admin'
  const home = admin ? '/admin' : '/score'
  const collapsed = usePreferences((state) => state.sidebarCollapsed)
  const toggleSidebar = usePreferences((state) => state.toggleSidebar)

  return (
    <div className="min-h-svh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-control focus:bg-accent focus:px-4 focus:py-2.5 focus:text-on-accent"
      >
        {t('common.skipToContent')}
      </a>

      {admin && (
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-30 hidden flex-col bg-rail py-5 text-rail-ink transition-[width] duration-(--duration-base) ease-out-expo lg:flex',
            collapsed ? 'w-16 px-2' : 'w-60 px-3',
          )}
        >
          <div className={cn('mb-8 flex items-center', collapsed ? 'flex-col gap-3' : 'justify-between gap-2')}>
            <Link to={home} className={cn('rounded-control py-1 outline-mark', !collapsed && 'px-3')}>
              <BrandMark showName={!collapsed} />
            </Link>
            <button
              type="button"
              onClick={toggleSidebar}
              aria-expanded={!collapsed}
              aria-controls="admin-sidebar-nav"
              aria-label={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
              title={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
              className="grid size-9 shrink-0 place-items-center rounded-control text-rail-muted outline-mark transition-colors duration-(--duration-fast) hover:bg-white/5 hover:text-rail-ink"
            >
              {collapsed ? (
                <PanelLeftOpen aria-hidden className="size-5" />
              ) : (
                <PanelLeftClose aria-hidden className="size-5" />
              )}
            </button>
          </div>
          <nav id="admin-sidebar-nav" aria-label={t('nav.main')} className="flex-1 [&_a]:outline-mark">
            <AdminNav variant="sidebar" collapsed={collapsed} />
          </nav>
          <div className={cn('border-t border-rail-line pt-3', collapsed && 'flex justify-center')}>
            {collapsed ? (
              <PreferencesMenu
                side="right"
                className="text-rail-muted outline-mark hover:bg-white/5 hover:text-rail-ink"
              />
            ) : (
              <PreferencesMenu variant="row" />
            )}
          </div>
        </aside>
      )}

      <header
        className={cn(
          'sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-canvas pr-2 pl-4',
          admin && 'lg:hidden',
        )}
      >
        <Link to={home} className="rounded-control">
          <BrandMark />
        </Link>
        <PreferencesMenu />
      </header>

      <main
        id="main"
        tabIndex={-1}
        className={cn(
          'outline-none',
          'transition-[padding] duration-(--duration-base) ease-out-expo',
          admin && 'pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0',
          admin && (collapsed ? 'lg:pl-16' : 'lg:pl-60'),
        )}
      >
        <Outlet />
      </main>

      {admin && (
        <nav
          aria-label={t('nav.main')}
          className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface lg:hidden"
        >
          <AdminNav variant="bar" />
        </nav>
      )}
    </div>
  )
}
