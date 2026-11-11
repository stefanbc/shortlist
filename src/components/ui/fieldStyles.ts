/** Shared look for text-like controls (Input, Textarea, Select, DateTimeField). */
export const controlClasses = [
  'w-full rounded-control bg-surface px-3.5 text-ink ring-1 ring-inset ring-line-strong placeholder:text-ink-faint',
  'transition-[box-shadow,background-color] duration-(--duration-fast)',
  'hover:ring-ink-faint focus:ring-2 focus:ring-ring focus:outline-none',
  'disabled:cursor-not-allowed disabled:opacity-55',
  'aria-invalid:ring-2 aria-invalid:ring-danger',
].join(' ')

/** aria-describedby value matching the ids that <Field> gives its hint/error. */
export function describedBy(id: string, { hint, error }: { hint?: unknown; error?: unknown }) {
  if (error) return `${id}-error`
  if (hint) return `${id}-hint`
  return undefined
}
