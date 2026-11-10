import * as Popover from '@radix-ui/react-popover'
import { Monitor, Moon, SlidersHorizontal, Sun, type LucideIcon } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { resolveLang, usePreferences, type Lang, type ThemePref } from '@/stores/preferences'

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
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-card bg-sunken/70 p-1 ring-1 ring-inset ring-line">
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
                'flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-control px-2 text-sm font-medium text-ink-muted',
                'transition-colors duration-(--duration-fast) hover:text-ink',
                'peer-checked:bg-surface peer-checked:text-ink peer-checked:shadow-pop dark:peer-checked:bg-line',
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
  className?: string
}

export function PreferencesMenu({ variant = 'icon', className }: PreferencesMenuProps) {
  const { t } = useTranslation()
  const theme = usePreferences((s) => s.theme)
  const lang = usePreferences((s) => s.lang)
  const setTheme = usePreferences((s) => s.setTheme)
  const setLang = usePreferences((s) => s.setLang)

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
          <Button variant="ghost" className={cn('w-full justify-start px-3', className)}>
            <SlidersHorizontal aria-hidden />
            <span className="flex-1 text-left">{t('prefs.open')}</span>
            <span className="text-xs font-semibold text-ink-faint uppercase">
              {resolveLang(lang)}
            </span>
          </Button>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          side={variant === 'row' ? 'top' : 'bottom'}
          sideOffset={8}
          collisionPadding={12}
          className={cn(
            'z-50 flex w-[min(20rem,calc(100vw-1.5rem))] flex-col gap-5 rounded-card bg-surface p-4 text-ink shadow-pop ring-1 ring-line outline-none',
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
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
