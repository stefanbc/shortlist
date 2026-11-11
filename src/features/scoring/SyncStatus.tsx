import { CircleAlert, CloudOff, CloudUpload, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/Badge'
import type { RejectReason } from '@/stores/scoreQueue'
import type { CellSync } from './api'

type SyncIndicatorProps = { pending: number; rejected: number; online: boolean }

/** Unobtrusive sync state, from what is actually waiting in the queue. */
export function SyncIndicator({ pending, rejected, online }: SyncIndicatorProps) {
  const { t } = useTranslation()
  let badge
  if (rejected > 0) {
    badge = (
      <Badge tone="danger">
        <CircleAlert aria-hidden className="size-3.5" />
        {t('scoring.sync.rejected', { count: rejected })}
      </Badge>
    )
  } else if (pending > 0) {
    badge = online ? (
      <Badge tone="warning">
        <CloudUpload aria-hidden className="size-3.5" />
        {t('scoring.sync.pending', { count: pending })}
      </Badge>
    ) : (
      <Badge tone="warning">
        <CloudOff aria-hidden className="size-3.5" />
        {t('scoring.sync.offline', { count: pending })}
      </Badge>
    )
  } else if (!online) {
    badge = (
      <Badge tone="neutral">
        <CloudOff aria-hidden className="size-3.5" />
        {t('scoring.sync.offlineIdle')}
      </Badge>
    )
  } else {
    badge = (
      <Badge tone="success">
        <Check aria-hidden className="size-3.5" />
        {t('scoring.sync.saved')}
      </Badge>
    )
  }
  return (
    <span role="status" className="inline-flex">
      {badge}
    </span>
  )
}

/** Explains, in plain words, why some of the juror's scores were not saved. */
export function RejectedNotice({ cells }: { cells: Record<string, CellSync> }) {
  const { t } = useTranslation()
  const reasons = new Set<RejectReason>()
  for (const cell of Object.values(cells)) if (cell.status === 'rejected') reasons.add(cell.reason)
  if (reasons.size === 0) return null
  return (
    <div className="flex gap-3 rounded-card bg-danger-soft px-4 py-3 text-sm text-danger ring-1 ring-danger/25">
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-semibold">{t('scoring.rejectedTitle')}</p>
        <ul className="mt-1 space-y-0.5">
          {[...reasons].map((reason) => (
            <li key={reason}>{t(`scoring.rejected.${reason}`)}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
