import { useEffect, useRef } from 'react'

export type ScoringKeyHandlers = {
  /** `1`–`5`: set that whole value. */
  onSet(value: number): void
  /** `.` (or `,`, the decimal key on Romanian keypads): make the current value a half. */
  onHalf(): void
  /** `Backspace`: clear the current criterion. */
  onClear(): void
  /** `ArrowUp`: previous criterion. */
  onPrev(): void
  /** `ArrowDown` / `Enter`: next criterion. */
  onNext(): void
  /** Off while a dialog owns the keyboard. */
  enabled?: boolean
}

/** Elements whose own keyboard behaviour must win over the scoring shortcuts. */
function ownsKeys(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  // A dialog (e.g. "now pitching") has the keyboard while it's open.
  if (target.closest('[role="dialog"],[role="alertdialog"]')) return true
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  // Enter activates a focused button or link; don't also move on.
  if (key === 'Enter' && (tag === 'BUTTON' || tag === 'A')) return true
  return false
}

/** Keyboard scoring for laptops (and phones with a keyboard), listening on the window. */
export function useScoringKeys(handlers: ScoringKeyHandlers): void {
  const latest = useRef(handlers)
  useEffect(() => {
    latest.current = handlers
  })
  const enabled = handlers.enabled ?? true

  useEffect(() => {
    if (!enabled) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if (ownsKeys(event.target, event.key)) return
      const h = latest.current
      const key = event.key
      if (key >= '1' && key <= '5' && key.length === 1) h.onSet(Number(key))
      else if (key === '.' || key === ',') h.onHalf()
      else if (key === 'Backspace') h.onClear()
      else if (key === 'ArrowUp') h.onPrev()
      else if (key === 'ArrowDown' || key === 'Enter') h.onNext()
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
