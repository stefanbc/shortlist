import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router'
import { useSession } from '@/stores/session'

type RequireRoleProps = {
  role: 'admin' | 'juror'
  children: ReactNode
}

/** Gates a route subtree on the signed-in user's role. Signed-out users go to /login;
 * a signed-in user with the other role goes to their own home instead of a dead end. */
export function RequireRole({ role, children }: RequireRoleProps) {
  const { t } = useTranslation()
  const status = useSession((s) => s.status)
  const profile = useSession((s) => s.profile)

  if (status === 'loading') {
    return (
      <div className="grid min-h-svh place-items-center">
        <p className="text-ink-muted">{t('common.loading')}</p>
      </div>
    )
  }

  if (status === 'signedOut' || !profile) {
    return <Navigate to="/login" replace />
  }

  if (profile.role !== role) {
    return <Navigate to={profile.role === 'admin' ? '/admin' : '/score'} replace />
  }

  return children
}
