import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/lib/i18n'
import { usePreferences, usePreferencesEffect } from './preferences'

type Listener = (event: { matches: boolean }) => void

function mockColorScheme(initiallyDark: boolean) {
  const listeners = new Set<Listener>()
  const mql = {
    matches: initiallyDark,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_: string, l: Listener) => listeners.add(l),
    removeEventListener: (_: string, l: Listener) => listeners.delete(l),
  }
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mql),
  )
  return {
    setDark(dark: boolean) {
      mql.matches = dark
      listeners.forEach((l) => l({ matches: dark }))
    },
  }
}

const html = () => document.documentElement

beforeEach(() => {
  localStorage.clear()
  usePreferences.setState({ theme: 'system', lang: null })
  html().classList.remove('dark')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('preferences', () => {
  it('system theme follows matchMedia', () => {
    const scheme = mockColorScheme(true)
    renderHook(() => usePreferencesEffect())
    expect(html()).toHaveClass('dark')

    act(() => scheme.setDark(false))
    expect(html()).not.toHaveClass('dark')

    act(() => scheme.setDark(true))
    expect(html()).toHaveClass('dark')
  })

  it('explicit dark sets html.dark', () => {
    mockColorScheme(false)
    renderHook(() => usePreferencesEffect())
    expect(html()).not.toHaveClass('dark')

    act(() => usePreferences.getState().setTheme('dark'))
    expect(html()).toHaveClass('dark')

    act(() => usePreferences.getState().setTheme('light'))
    expect(html()).not.toHaveClass('dark')
  })

  it('language defaults to browser ro-RO → ro', async () => {
    mockColorScheme(false)
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['ro-RO', 'en-US'])
    renderHook(() => usePreferencesEffect())
    await waitFor(() => expect(i18n.language).toBe('ro'))
    expect(html()).toHaveAttribute('lang', 'ro')
  })

  it('explicit language wins over the browser and is persisted', async () => {
    mockColorScheme(false)
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['ro-RO'])
    renderHook(() => usePreferencesEffect())
    act(() => usePreferences.getState().setLang('en'))
    await waitFor(() => expect(i18n.language).toBe('en'))
    expect(JSON.parse(localStorage.getItem('shortlist.prefs') ?? '{}').state).toEqual({
      theme: 'system',
      lang: 'en',
    })
  })
})
