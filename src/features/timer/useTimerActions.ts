import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { Id } from '@/domain/types'
import { useTimerControl, type TimerAction } from '@/features/events/api'

/** Seconds added or removed per press of the +/- buttons. */
export const ADJUST_SECONDS = 30

/** Sends timer actions and reports a failure in the interface's voice. */
export function useTimerActions(eventId: Id) {
  const { t } = useTranslation()
  const { mutate, isPending } = useTimerControl(eventId)
  const run = useCallback(
    (action: TimerAction, seconds?: number) => {
      mutate({ action, seconds }, { onError: () => toast.error(t('timer.error')) })
    },
    [mutate, t],
  )
  return { pending: isPending, run }
}
