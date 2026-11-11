import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router'
import { roleHome } from '@/domain/profiles'
import { BrandMark } from '@/components/layout/BrandMark'
import { PreferencesMenu } from '@/components/layout/PreferencesMenu'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { appUrl } from '@/lib/appUrl'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/stores/session'

/** Admin sign-in: password, or a one-time email link. Jurors never see this page —
 * they sign in through their personal /j/:token link instead. A signed-in user (including
 * one who just signed in here) is sent on to their role's home. */
export function LoginPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordPending, setPasswordPending] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [magicLinkPending, setMagicLinkPending] = useState(false)
  const [magicLinkError, setMagicLinkError] = useState<string | null>(null)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const status = useSession((s) => s.status)
  const profile = useSession((s) => s.profile)

  async function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault()
    setPasswordError(null)
    setPasswordPending(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setPasswordPending(false)
    if (error) setPasswordError(t('auth.invalidCredentials'))
  }

  async function handleMagicLinkSubmit(event: FormEvent) {
    event.preventDefault()
    setMagicLinkError(null)
    setMagicLinkPending(true)
    // Only existing admins can request a link — the login form never creates accounts.
    // The link lands on the app root, which routes by role once the session from the
    // link's tokens settles; that URL must be in Supabase Auth's Redirect URLs.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: appUrl('/') },
    })
    setMagicLinkPending(false)
    if (error) setMagicLinkError(t('auth.genericError'))
    else setMagicLinkSent(true)
  }

  if (status === 'signedIn' && profile) return <Navigate to={roleHome(profile.role)} replace />

  return (
    <div className="relative grid min-h-svh place-items-center px-4 py-16">
      <PreferencesMenu className="absolute top-3 right-3" />
      <main className="w-full max-w-md">
        <BrandMark className="mb-8" />
        <h1 className="mb-1.5 text-2xl font-bold">{t('auth.signIn')}</h1>
        <p className="mb-6 text-ink-muted">{t('auth.signInHint')}</p>

        <Card>
          <CardBody>
            <Tabs defaultValue="password">
              <TabsList>
                <TabsTrigger value="password">{t('auth.tabPassword')}</TabsTrigger>
                <TabsTrigger value="magicLink">{t('auth.tabMagicLink')}</TabsTrigger>
              </TabsList>

              <TabsContent value="password">
                <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
                  <Field id="login-email" label={t('auth.emailLabel')}>
                    <Input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </Field>
                  <Field id="login-password" label={t('auth.passwordLabel')} error={passwordError}>
                    <Input
                      id="login-password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </Field>
                  <Button type="submit" loading={passwordPending}>
                    {t('auth.submitPassword')}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="magicLink">
                <form onSubmit={handleMagicLinkSubmit} className="flex flex-col gap-4">
                  <Field
                    id="login-email-magic"
                    label={t('auth.emailLabel')}
                    hint={t('auth.magicLinkHint')}
                  >
                    <Input
                      id="login-email-magic"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </Field>
                  {magicLinkSent ? (
                    <p role="status" className="text-sm text-ink-muted">
                      {t('auth.magicLinkSent')}
                    </p>
                  ) : (
                    <Button type="submit" loading={magicLinkPending}>
                      {t('auth.submitMagicLink')}
                    </Button>
                  )}
                  {magicLinkError && <p className="text-sm text-danger">{magicLinkError}</p>}
                </form>
              </TabsContent>
            </Tabs>
          </CardBody>
        </Card>
      </main>
    </div>
  )
}
