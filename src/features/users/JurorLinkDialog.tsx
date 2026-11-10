import { Copy, Link2Off, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dialog, DialogContent } from '@/components/ui/Dialog'
import { Skeleton } from '@/components/ui/Skeleton'
import type { Profile } from '@/stores/session'
import { useIssueJurorLink, useRevokeJurorLink } from './api'

type JurorLinkDialogProps = {
  open: boolean
  onOpenChange(open: boolean): void
  juror: Profile | null
}

/** The juror's personal sign-in link: a URL plus a QR code to hand out or send. Opens
 * with a fresh link already issued (an old one is revoked server-side the moment a new
 * one is issued), and offers "generate a new one" and "revoke" for a leaked link. */
export function JurorLinkDialog({ open, onOpenChange, juror }: JurorLinkDialogProps) {
  const { t } = useTranslation()
  const issueLink = useIssueJurorLink(juror?.id ?? '')
  const revokeLink = useRevokeJurorLink()
  const [confirmAction, setConfirmAction] = useState<'regenerate' | 'revoke' | null>(null)
  const [revoked, setRevoked] = useState(false)

  // useMutation returns a fresh result object every render, so it can't go in the effect's
  // dependency array without the effect re-firing (and re-issuing a link) on every render.
  // A ref holding the latest value sidesteps that: the effect below only reads `.current`.
  // The ref is updated from its own no-dependency effect (after render, not during it).
  const issueLinkRef = useRef(issueLink)
  useEffect(() => {
    issueLinkRef.current = issueLink
  })

  // Fetch-on-open, mirroring RedeemJurorLinkPage's fetch-on-mount effect: issuing a link
  // is a real side effect (it revokes the juror's previous one), not state mirrored from
  // props, so it belongs in an effect rather than computed during render. `revoked` isn't
  // reset here: closing the dialog (handleOpenChange) already clears it, so by the time
  // this runs again for a reopen it's already false.
  useEffect(() => {
    if (open && juror?.id) issueLinkRef.current.mutate()
  }, [open, juror?.id])

  function handleOpenChange(next: boolean) {
    if (!next) {
      issueLink.reset()
      setConfirmAction(null)
      setRevoked(false)
    }
    onOpenChange(next)
  }

  async function handleCopy() {
    if (!issueLink.data) return
    try {
      await navigator.clipboard.writeText(issueLink.data.url)
      toast.success(t('users.linkCopied'))
    } catch {
      toast.error(t('users.linkCopyError'))
    }
  }

  async function confirmPending() {
    if (!juror) return
    if (confirmAction === 'regenerate') {
      try {
        setRevoked(false)
        await issueLink.mutateAsync()
      } catch {
        toast.error(t('users.linkLoadError'))
        throw new Error('issue failed')
      }
      return
    }
    if (confirmAction === 'revoke') {
      try {
        await revokeLink.mutateAsync(juror.id)
        issueLink.reset()
        setRevoked(true)
      } catch {
        toast.error(t('users.linkRevokeError'))
        throw new Error('revoke failed')
      }
    }
  }

  const confirmContent =
    confirmAction === 'regenerate'
      ? {
          title: t('users.confirmRegenerateTitle'),
          description: t('users.confirmRegenerateBody'),
          tone: 'danger' as const,
        }
      : confirmAction === 'revoke'
        ? {
            title: t('users.confirmRevokeTitle'),
            description: t('users.confirmRevokeBody', { name: juror?.displayName ?? '' }),
            tone: 'danger' as const,
          }
        : null

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          title={t('users.linkDialogTitle', { name: juror?.displayName ?? '' })}
          description={t('users.linkDialogDescription')}
        >
          <div className="mt-5 flex flex-col items-center gap-5">
            {issueLink.isPending && (
              <>
                <Skeleton className="size-44" />
                <Skeleton className="h-11 w-full" />
              </>
            )}

            {!issueLink.isPending && issueLink.isError && (
              <p className="text-sm text-danger">{t('users.linkLoadError')}</p>
            )}

            {!issueLink.isPending && revoked && (
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="grid size-14 place-items-center rounded-full bg-danger-soft text-danger">
                  <Link2Off aria-hidden className="size-6" />
                </div>
                <p className="text-ink-muted">
                  {t('users.linkRevokedHint', { name: juror?.displayName ?? '' })}
                </p>
              </div>
            )}

            {!issueLink.isPending && !revoked && issueLink.data && (
              <>
                <div className="rounded-card bg-surface p-4 ring-1 ring-line">
                  <QRCodeSVG
                    value={issueLink.data.url}
                    size={176}
                    title={t('users.qrTitle', { name: juror?.displayName ?? '' })}
                  />
                </div>
                <p className="w-full rounded-control bg-sunken/60 px-3.5 py-2.5 text-sm break-all ring-1 ring-line">
                  {issueLink.data.url}
                </p>
              </>
            )}

            <div className="flex w-full flex-col gap-2">
              {!revoked && issueLink.data && (
                <Button variant="secondary" onClick={handleCopy}>
                  <Copy aria-hidden />
                  {t('users.copyLink')}
                </Button>
              )}
              <Button variant="secondary" onClick={() => setConfirmAction('regenerate')}>
                <RefreshCw aria-hidden />
                {t('users.regenerateLink')}
              </Button>
              {!revoked && issueLink.data && (
                <Button variant="ghost" onClick={() => setConfirmAction('revoke')}>
                  <Link2Off aria-hidden />
                  {t('users.revokeLink')}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {confirmContent && (
        <ConfirmDialog
          open={confirmAction !== null}
          onOpenChange={(next) => !next && setConfirmAction(null)}
          title={confirmContent.title}
          description={confirmContent.description}
          confirmLabel={t('common.confirm')}
          tone={confirmContent.tone}
          onConfirm={confirmPending}
        />
      )}
    </>
  )
}
