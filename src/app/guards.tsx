import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router'
import { roleHome } from '@/domain/profiles'
import { useSession } from '@/stores/session'

type RequireRoleProps = {
  role: 'admin' | 'juror'
  children: ReactNode
}

function SessionLoading() {
  const { t } = useTranslation()
  return (
    <div className="grid min-h-svh place-items-center">
      <p className="text-ink-muted">{t('common.loading')}</p>
    </div>
  )
}

/** The app root ("/"). Waits for the session to settle -- which includes auth-js reading
 * a magic link's tokens out of the URL hash, since the store stays 'loading' until the
 * client's first auth event -- then sends the user to their role's home, or to /login. */
export function RoleHomeRedirect() {
  const status = useSession((s) => s.status)
  const profile = useSession((s) => s.profile)

  if (status === 'loading') return <SessionLoading />
  if (status === 'signedIn' && profile) return <Navigate to={roleHome(profile.role)} replace />
  return <Navigate to="/login" replace />
}

/** Gates a route subtree on the signed-in user's role. Signed-out users go to /login;
 * a signed-in user with the other role goes to their own home instead of a dead end. */
export function RequireRole({ role, children }: RequireRoleProps) {
  const status = useSession((s) => s.status)
  const profile = useSession((s) => s.profile)

  if (status === 'loading') return <SessionLoading />

  if (status === 'signedOut' || !profile) {
    return <Navigate to="/login" replace />
  }

  if (profile.role !== role) {
    return <Navigate to={roleHome(profile.role)} replace />
  }

  return children
}
