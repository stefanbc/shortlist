import type { TimerWarning } from '@/domain/pitchTimer'

/** The clock's colour stages, shared by every screen: yellow is the highlighter (wrap
 * up), red is a solid block (stop, and everything after zero). */
export function clockWarningClasses(warning: TimerWarning): string {
  if (warning === 'yellow') return 'marked'
  if (warning === 'red') return 'marked bg-danger text-canvas'
  return ''
}

export function barWarningClasses(warning: TimerWarning): string {
  if (warning === 'yellow') return 'bg-mark'
  if (warning === 'red') return 'bg-danger'
  return 'bg-accent'
}
