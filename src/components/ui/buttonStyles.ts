import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent shadow-glow hover:bg-accent-hover',
  secondary: 'bg-raised text-ink ring-1 ring-inset ring-line hover:ring-line-strong',
  ghost: 'text-ink-muted hover:bg-raised hover:text-ink',
  danger: 'bg-danger text-white hover:bg-danger-hover',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 gap-1.5 px-3 text-sm',
  md: 'h-11 gap-2 px-4 text-[0.95rem]',
  lg: 'h-13 gap-2.5 px-6 text-base',
  icon: 'size-11 [&_svg]:size-5',
}

/** Classes for anything that should look like a button (e.g. a router <Link>). */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(
    'inline-flex shrink-0 select-none items-center justify-center rounded-control font-semibold whitespace-nowrap',
    'transition-[background-color,box-shadow,color,transform] duration-(--duration-fast) ease-out-expo',
    'active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-[1.1em]',
    variants[variant],
    sizes[size],
    className,
  )
}
