import '@testing-library/jest-dom/vitest'
import '@/lib/i18n'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest runs without globals, so Testing Library cannot register this itself.
afterEach(cleanup)

// jsdom has no matchMedia; default to a light, wide, motion-OK screen. Tests may stub it.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

// jsdom doesn't implement ResizeObserver; recharts' ResponsiveContainer needs one to exist
// (it reports a 0x0 box in jsdom either way, since jsdom does no layout).
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
