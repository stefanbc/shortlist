import * as RadixTabs from '@radix-ui/react-tabs'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

export const Tabs = RadixTabs.Root

export function TabsList({ className, ...props }: ComponentProps<typeof RadixTabs.List>) {
  return (
    <RadixTabs.List
      className={cn(
        'inline-flex max-w-full gap-1 overflow-x-auto rounded-card bg-sunken/70 p-1 ring-1 ring-inset ring-line',
        className,
      )}
      {...props}
    />
  )
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof RadixTabs.Trigger>) {
  return (
    <RadixTabs.Trigger
      className={cn(
        'h-9 shrink-0 rounded-control px-3.5 text-sm font-medium text-ink-muted transition-colors duration-(--duration-fast)',
        'hover:text-ink data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-pop dark:data-[state=active]:bg-line',
        className,
      )}
      {...props}
    />
  )
}

export function TabsContent({ className, ...props }: ComponentProps<typeof RadixTabs.Content>) {
  return (
    <RadixTabs.Content
      className={cn('mt-5 outline-none data-[state=active]:animate-fade-in', className)}
      {...props}
    />
  )
}
