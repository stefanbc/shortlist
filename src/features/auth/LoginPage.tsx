import { Eye, EyeOff } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router'
import { roleHome } from '@/domain/profiles'
import { BrandMark } from '@/components/layout/BrandMark'
import { PreferencesMenu } from '@/components/layout/PreferencesMenu'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { appUrl } from '@/lib/appUrl'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/stores/session'

/** Admin sign-in: password, or a one-time email link. Jurors never see this page —
 * they sign in through their personal /j/:token link instead. A signed-in user (including
 * one who just signed in here) is sent on to their role's home. */
export function LoginPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
    <div className="relative grid min-h-svh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="hidden flex-col justify-between bg-rail p-10 text-rail-ink lg:flex">
        <BrandMark />
        <MarkedList />
        <p className="max-w-xs text-rail-muted">{t('common.tagline')}</p>
      </aside>

      <PreferencesMenu className="absolute top-3 right-3" />
      <main className="mx-auto flex w-full max-w-md flex-col justify-center px-5 py-16">
        <BrandMark className="mb-10 lg:hidden" />
        <h1 className="mb-2 text-3xl">{t('auth.signIn')}</h1>
        <p className="mb-8 text-ink-muted">{t('auth.signInHint')}</p>

        <div>
          <div>
            <Tabs defaultValue="password">
              <TabsList>
                <TabsTrigger value="password">{t('auth.tabPassword')}</TabsTrigger>
                <TabsTrigger value="magicLink">{t('auth.tabMagicLink')}</TabsTrigger>
              </TabsList>

              <TabsContent value="password">
                <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-5">
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
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="pr-12"
                      />
                      <button
                        type="button"
                        aria-pressed={showPassword}
                        aria-label={t('auth.showPassword')}
                        onClick={() => setShowPassword((shown) => !shown)}
                        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-control text-ink-muted -outline-offset-4 hover:text-ink"
                      >
                        {showPassword ? (
                          <EyeOff aria-hidden className="size-5" />
                        ) : (
                          <Eye aria-hidden className="size-5" />
                        )}
                      </button>
                    </div>
                  </Field>
                  <Button type="submit" size="lg" loading={passwordPending}>
                    {t('auth.submitPassword')}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="magicLink">
                <form onSubmit={handleMagicLinkSubmit} className="flex flex-col gap-5">
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
                    <Button type="submit" size="lg" loading={magicLinkPending}>
                      {t('auth.submitMagicLink')}
                    </Button>
                  )}
                  {magicLinkError && <p className="text-sm text-danger">{magicLinkError}</p>}
                </form>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
    </div>
  )
}

/** Row widths (%) of the decorative list: a ranking sheet with its top three gone over
 * with the highlighter. Bars stand in for names, so there is nothing to translate. */
const LIST_ROWS = [72, 58, 66, 44, 61, 38, 52]

function MarkedList() {
  return (
    <ol aria-hidden className="flex max-w-sm flex-col gap-2.5">
      {LIST_ROWS.map((width, index) => {
        const picked = index < 3
        return (
          <li key={index} className="flex items-center gap-4">
            <span
              className={cn(
                'numeral w-6 text-right text-2xl leading-none',
                !picked && 'text-rail-muted/60',
              )}
            >
              {index + 1}
            </span>
            <span
              className={cn('flex h-10 flex-1 items-center px-3', picked && 'marked')}
              style={picked ? { rotate: `${[-0.6, 0.4, -0.3][index]}deg` } : undefined}
            >
              <span
                className={cn('h-2.5 rounded-full', picked ? 'bg-on-mark' : 'bg-rail-muted/35')}
                style={{ width: `${width}%` }}
              />
            </span>
          </li>
        )
      })}
    </ol>
  )
}
