import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

export type BadgeTone = 'neutral' | 'accent' | 'gold' | 'success' | 'warning' | 'danger'

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-raised text-ink-muted ring-line',
  accent: 'bg-accent-soft text-accent-ink ring-accent/25',
  gold: 'bg-gold-soft text-gold ring-gold/30',
  success: 'bg-success-soft text-success ring-success/25',
  warning: 'bg-warning-soft text-warning ring-warning/25',
  danger: 'bg-danger-soft text-danger ring-danger/25',
}

type BadgeProps = ComponentProps<'span'> & {
  tone?: BadgeTone
  /** Leading status dot; `live` makes it pulse. */
  dot?: boolean | 'live'
}

export function Badge({
  tone = 'neutral',
  dot = false,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset',
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot && (
        <span aria-hidden className="relative flex size-1.5">
          {dot === 'live' && (
            <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-60 motion-reduce:hidden" />
          )}
          <span className="relative size-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  )
}
