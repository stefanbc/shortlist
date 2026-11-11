import { useTranslation } from 'react-i18next'
import type { TimerView } from '@/domain/pitchTimer'
import type { TimerSource } from './useTimerView'

/** One short line saying what the timer is doing: "Ready", "Paused", "Over time",
 * "Until 13:30". Null while it is simply running. */
export function useTimerStatus(source: TimerSource, view: TimerView): string | null {
  const { t, i18n } = useTranslation()
  if (view.over) return t('timer.over')
  if (view.mode === 'until' && source.timer?.targetAt) {
    return t('timer.until', {
      time: new Intl.DateTimeFormat(i18n.language, { timeStyle: 'short' }).format(
        new Date(source.timer.targetAt),
      ),
    })
  }
  if (view.phase === 'paused') return t('timer.paused')
  if (view.phase === 'ready') return t('timer.ready')
  return view.warning === 'red' ? t('timer.stopNow') : view.warning === 'yellow' ? t('timer.wrapUp') : t('timer.running')
}
