import * as Popover from '@radix-ui/react-popover'
import { LogOut, Monitor, Moon, SlidersHorizontal, Sun, type LucideIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { resolveLang, usePreferences, type Lang, type ThemePref } from '@/stores/preferences'
import { useSession } from '@/stores/session'

type Option<T extends string> = { value: T; label: string; icon?: LucideIcon }

/** Radio group drawn as a segmented control; native radios give arrow-key support for free. */
function Segmented<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string
  value: T
  options: Option<T>[]
  onChange(value: T): void
}) {
  const name = useId()
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-ink-muted">{legend}</legend>
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-control bg-sunken p-1">
        {options.map(({ value: optionValue, label, icon: Icon }) => (
          <label key={optionValue} className="relative">
            <input
              type="radio"
              name={name}
              value={optionValue}
              checked={value === optionValue}
              onChange={() => onChange(optionValue)}
              className="peer sr-only"
            />
            <span
              className={cn(
                'flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-[0.25rem] px-2 text-sm font-medium text-ink-muted',
                'transition-colors duration-(--duration-fast) hover:text-ink',
                'peer-checked:bg-surface peer-checked:font-semibold peer-checked:text-ink peer-checked:ring-1 peer-checked:ring-line-strong dark:peer-checked:bg-raised',
                'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-ring',
              )}
            >
              {Icon && <Icon aria-hidden className="size-4 shrink-0" />}
              {label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

type PreferencesMenuProps = {
  /** `icon`: compact square trigger (top bars). `row`: full-width labelled trigger (sidebar). */
  variant?: 'icon' | 'row'
  /** Where the panel opens. Defaults to below an icon trigger, above a row trigger. */
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
}

export function PreferencesMenu({ variant = 'icon', side, className }: PreferencesMenuProps) {
  const { t } = useTranslation()
  const theme = usePreferences((s) => s.theme)
  const lang = usePreferences((s) => s.lang)
  const setTheme = usePreferences((s) => s.setTheme)
  const setLang = usePreferences((s) => s.setLang)
  const profile = useSession((s) => s.profile)
  const signOut = useSession((s) => s.signOut)
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await signOut()
    } finally {
      setSigningOut(false)
    }
  }

  const themes: Option<ThemePref>[] = [
    { value: 'light', label: t('prefs.light'), icon: Sun },
    { value: 'dark', label: t('prefs.dark'), icon: Moon },
    { value: 'system', label: t('prefs.system'), icon: Monitor },
  ]
  // Language names stay in their own language so they are recognisable either way.
  const langs: Option<Lang>[] = [
    { value: 'ro', label: 'Română' },
    { value: 'en', label: 'English' },
  ]

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        {variant === 'icon' ? (
          <Button variant="ghost" size="icon" aria-label={t('prefs.open')} className={className}>
            <SlidersHorizontal aria-hidden />
          </Button>
        ) : (
          <Button
            variant="ghost"
            aria-label={t('prefs.open')}
            className={cn(
              'h-auto min-h-12 w-full justify-start px-3 py-2 text-rail-muted hover:bg-white/5 hover:text-rail-ink',
              className,
            )}
          >
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-rail-ink">
                {profile?.displayName ?? t('prefs.open')}
              </span>
              <span className="block text-xs font-normal">{t('prefs.open')}</span>
            </span>
            <SlidersHorizontal aria-hidden />
          </Button>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          side={side ?? (variant === 'row' ? 'top' : 'bottom')}
          sideOffset={8}
          collisionPadding={12}
          className={cn(
            'z-50 flex w-[min(20rem,calc(100vw-1.5rem))] flex-col gap-5 rounded-card border border-line bg-surface p-4 text-ink shadow-pop outline-none',
            'data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out',
          )}
        >
          <Segmented legend={t('prefs.theme')} value={theme} options={themes} onChange={setTheme} />
          <Segmented
            legend={t('prefs.language')}
            value={resolveLang(lang)}
            options={langs}
            onChange={setLang}
          />
          {profile && (
            <div className="-mx-4 -mb-4 border-t border-line p-4">
              <p className="truncate font-semibold">{profile.displayName}</p>
              {profile.email && (
                <p className="truncate text-sm text-ink-muted">{profile.email}</p>
              )}
              {profile.role === 'juror' && (
                <p className="mt-2 text-sm text-ink-muted">{t('prefs.signOutJurorHint')}</p>
              )}
              <Button
                variant="secondary"
                className="mt-3 w-full"
                loading={signingOut}
                onClick={handleSignOut}
              >
                {!signingOut && <LogOut aria-hidden />}
                {t('prefs.signOut')}
              </Button>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
