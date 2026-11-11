import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { Id } from '@/domain/types'
import { useTimerControl, type TimerCommand } from '@/features/events/api'

/** Seconds added or removed per press of the +/- buttons. */
export const ADJUST_SECONDS = 30

/** Sends timer commands and reports a failure in the interface's voice. `run` resolves
 * to whether the command went through. */
export function useTimerActions(eventId: Id) {
  const { t } = useTranslation()
  const { mutateAsync, isPending } = useTimerControl(eventId)
  const run = useCallback(
    async (command: TimerCommand): Promise<boolean> => {
      try {
        await mutateAsync(command)
        return true
      } catch {
        toast.error(t('timer.error'))
        return false
      }
    },
    [mutateAsync, t],
  )
  return { pending: isPending, run }
}
