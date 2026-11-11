import * as RadixDialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { Button } from './Button'

export const Dialog = RadixDialog.Root
export const DialogTrigger = RadixDialog.Trigger
export const DialogClose = RadixDialog.Close

export const overlayClasses =
  'fixed inset-0 z-50 bg-overlay data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out'

type DialogContentProps = Omit<ComponentProps<typeof RadixDialog.Content>, 'title'> & {
  title: ReactNode
  description?: ReactNode
  /** Hide the corner close button (e.g. when the footer already offers a way out). */
  hideClose?: boolean
}

/** Centered modal. On phones it rises from the bottom edge like a sheet. */
export function DialogContent({
  title,
  description,
  hideClose = false,
  className,
  children,
  ...props
}: DialogContentProps) {
  const { t } = useTranslation()
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className={overlayClasses} />
      <RadixDialog.Content
        {...(description ? {} : { 'aria-describedby': undefined })}
        className={cn(
          'fixed z-50 flex max-h-[92svh] flex-col overflow-y-auto bg-surface text-ink shadow-pop ring-1 ring-line outline-none',
          'inset-x-0 bottom-0 rounded-t-panel p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]',
          'data-[state=open]:animate-slide-in-up data-[state=closed]:animate-slide-out-down',
          'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-[min(32rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-panel sm:p-7',
          'sm:data-[state=open]:animate-pop-in sm:data-[state=closed]:animate-pop-out',
          className,
        )}
        {...props}
      >
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <RadixDialog.Title className="text-xl font-semibold">{title}</RadixDialog.Title>
            {description && (
              <RadixDialog.Description className="mt-1.5 text-ink-muted">
                {description}
              </RadixDialog.Description>
            )}
          </div>
          {!hideClose && (
            <RadixDialog.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                className="-mt-2 -mr-2"
                aria-label={t('common.close')}
              >
                <X aria-hidden />
              </Button>
            </RadixDialog.Close>
          )}
        </div>
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  )
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>button]:w-full sm:[&>button]:w-auto',
        className,
      )}
      {...props}
    />
  )
}
