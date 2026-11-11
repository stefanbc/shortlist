import { useEffect } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import i18n from '@/lib/i18n'

export type ThemePref = 'light' | 'dark' | 'system'
export type Lang = 'ro' | 'en'

type PreferencesState = {
  theme: ThemePref
  /** null = follow the browser language */
  lang: Lang | null
  setTheme(t: ThemePref): void
  setLang(l: Lang): void
}

export const PREFERENCES_STORAGE_KEY = 'shortlist.prefs'

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: 'system',
      lang: null,
      setTheme: (theme) => set({ theme }),
      setLang: (lang) => set({ lang }),
    }),
    {
      name: PREFERENCES_STORAGE_KEY,
      partialize: ({ theme, lang }) => ({ theme, lang }),
    },
  ),
)

/** First browser language we support wins; anything else falls back to English. */
export function detectBrowserLang(languages: readonly string[] = navigator.languages): Lang {
  for (const tag of languages) {
    const base = tag.toLowerCase().split('-')[0]
    if (base === 'ro' || base === 'en') return base
  }
  return 'en'
}

export function resolveLang(lang: Lang | null): Lang {
  return lang ?? detectBrowserLang()
}

const DARK_QUERY = '(prefers-color-scheme: dark)'

function applyDark(dark: boolean) {
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.style.colorScheme = dark ? 'dark' : 'light'
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#100e1f' : '#f6f5fb')
}

/**
 * Applies preferences to the document: the `dark` class on <html> (following the
 * OS live when theme is 'system') and the active i18n language + <html lang>.
 * Mount once, near the root.
 */
export function usePreferencesEffect() {
  const theme = usePreferences((s) => s.theme)
  const lang = usePreferences((s) => s.lang)

  useEffect(() => {
    if (theme !== 'system') {
      applyDark(theme === 'dark')
      return
    }
    if (typeof window.matchMedia !== 'function') {
      applyDark(false)
      return
    }
    const mql = window.matchMedia(DARK_QUERY)
    applyDark(mql.matches)
    const onChange = (event: { matches: boolean }) => applyDark(event.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [theme])

  useEffect(() => {
    const active = resolveLang(lang)
    document.documentElement.lang = active
    if (i18n.language !== active) void i18n.changeLanguage(active)
  }, [lang])
}
