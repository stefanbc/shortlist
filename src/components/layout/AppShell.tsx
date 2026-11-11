import { Link, Outlet } from 'react-router'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
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

  return (
    <div className="min-h-svh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-control focus:bg-accent focus:px-4 focus:py-2.5 focus:text-on-accent"
      >
        {t('common.skipToContent')}
      </a>

      {admin && (
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-rail px-3 py-5 text-rail-ink lg:flex">
          <Link to={home} className="mb-8 rounded-control px-3 py-1 outline-mark">
            <BrandMark />
          </Link>
          <nav aria-label={t('nav.main')} className="flex-1 [&_a]:outline-mark">
            <AdminNav variant="sidebar" />
          </nav>
          <div className="border-t border-rail-line pt-3">
            <PreferencesMenu variant="row" />
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
          admin && 'pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-60',
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
