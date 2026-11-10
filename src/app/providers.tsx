import { MotionConfig } from 'motion/react'
import type { ReactNode } from 'react'
import { Toaster } from 'sonner'
import '@/lib/i18n'
import { usePreferences, usePreferencesEffect } from '@/stores/preferences'

export function AppProviders({ children }: { children: ReactNode }) {
  usePreferencesEffect()
  const theme = usePreferences((s) => s.theme)

  return (
    <MotionConfig reducedMotion="user">
      {children}
      <Toaster
        theme={theme}
        position="top-center"
        offset={16}
        toastOptions={{
          classNames: {
            toast:
              '!rounded-card !bg-surface !text-ink !ring-1 !ring-line !border-0 !shadow-pop !font-sans',
            description: '!text-ink-muted',
          },
        }}
      />
    </MotionConfig>
  )
}
