import * as RadixDialog from '@radix-ui/react-dialog'
import { TriangleAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { Button } from './Button'
import { DialogFooter, overlayClasses } from './Dialog'

type ConfirmDialogProps = {
  open: boolean
  onOpenChange(open: boolean): void
  title: ReactNode
  description: ReactNode
  confirmLabel: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  /** May return a promise: buttons stay disabled until it settles, then the dialog closes. If it throws, the dialog stays open. */
  onConfirm(): void | Promise<void>
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  const [pending, setPending] = useState(false)

  async function confirm() {
    if (pending) return
    setPending(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch {
      // Caller reports the error; keep the dialog open so they can retry or cancel.
    } finally {
      setPending(false)
    }
  }

  return (
    <RadixDialog.Root open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={overlayClasses} />
        <RadixDialog.Content
          role="alertdialog"
          onPointerDownOutside={(e) => e.preventDefault()}
          className={cn(
            'fixed z-50 bg-surface text-ink shadow-pop ring-1 ring-line outline-none',
            'inset-x-0 bottom-0 rounded-t-panel p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]',
            'data-[state=open]:animate-slide-in-up data-[state=closed]:animate-slide-out-down',
            'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-[min(28rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-panel sm:p-7',
            'sm:data-[state=open]:animate-pop-in sm:data-[state=closed]:animate-pop-out',
          )}
        >
          {tone === 'danger' && (
            <div className="mb-4 grid size-11 place-items-center rounded-full bg-danger-soft text-danger">
              <TriangleAlert aria-hidden className="size-5" />
            </div>
          )}
          <RadixDialog.Title className="text-xl font-semibold">{title}</RadixDialog.Title>
          <RadixDialog.Description className="mt-2 text-ink-muted">
            {description}
          </RadixDialog.Description>
          <DialogFooter>
            <RadixDialog.Close asChild>
              <Button variant="secondary" disabled={pending}>
                {cancelLabel ?? t('common.cancel')}
              </Button>
            </RadixDialog.Close>
            <Button
              variant={tone === 'danger' ? 'danger' : 'primary'}
              loading={pending}
              onClick={confirm}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
