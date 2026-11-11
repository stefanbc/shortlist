import * as RadixTabs from '@radix-ui/react-tabs'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

export const Tabs = RadixTabs.Root

export function TabsList({ className, ...props }: ComponentProps<typeof RadixTabs.List>) {
  return (
    <RadixTabs.List
      className={cn(
        'flex max-w-full gap-5 overflow-x-auto border-b border-line',
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
        '-mb-px h-11 shrink-0 border-b-2 border-transparent text-[0.95rem] font-medium text-ink-muted transition-colors duration-(--duration-fast)',
        'hover:text-ink data-[state=active]:border-accent data-[state=active]:font-semibold data-[state=active]:text-ink',
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
