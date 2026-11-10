import * as RadixDialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { Button } from './Button'
import { overlayClasses } from './Dialog'

export const Sheet = RadixDialog.Root
export const SheetTrigger = RadixDialog.Trigger
export const SheetClose = RadixDialog.Close

type SheetContentProps = Omit<ComponentProps<typeof RadixDialog.Content>, 'title'> & {
  title: ReactNode
  description?: ReactNode
}

/** Side panel for longer forms: from the right on wide screens, from the bottom on phones. */
export function SheetContent({
  title,
  description,
  className,
  children,
  ...props
}: SheetContentProps) {
  const { t } = useTranslation()
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className={overlayClasses} />
      <RadixDialog.Content
        {...(description ? {} : { 'aria-describedby': undefined })}
        className={cn(
          'fixed z-50 flex flex-col bg-surface text-ink shadow-pop ring-1 ring-line outline-none',
          'inset-x-0 bottom-0 max-h-[92svh] rounded-t-panel',
          'data-[state=open]:animate-slide-in-up data-[state=closed]:animate-slide-out-down',
          'md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[min(30rem,100vw)] md:rounded-none md:rounded-l-panel',
          'md:data-[state=open]:animate-slide-in-right md:data-[state=closed]:animate-slide-out-right',
          className,
        )}
        {...props}
      >
        <div className="flex items-start gap-4 border-b border-line px-6 py-5">
          <div className="min-w-0 flex-1">
            <RadixDialog.Title className="text-xl font-semibold">{title}</RadixDialog.Title>
            {description && (
              <RadixDialog.Description className="mt-1 text-sm text-ink-muted">
                {description}
              </RadixDialog.Description>
            )}
          </div>
          <RadixDialog.Close asChild>
            <Button
              variant="ghost"
              size="icon"
              className="-mt-1.5 -mr-2"
              aria-label={t('common.close')}
            >
              <X aria-hidden />
            </Button>
          </RadixDialog.Close>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  )
}
