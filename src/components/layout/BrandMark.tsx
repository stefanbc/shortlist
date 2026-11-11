import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'

/** The Shortlist mark: a list cut down to its top entries, the first one picked. */
export function BrandMark({
  className,
  showName = true,
}: {
  className?: string
  showName?: boolean
}) {
  const { t } = useTranslation()
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg viewBox="0 0 24 24" aria-hidden className="size-7 shrink-0">
        <rect x="2" y="3.5" width="20" height="4.5" rx="2.25" className="fill-accent" />
        <rect x="2" y="10" width="14" height="4.5" rx="2.25" className="fill-ink-muted/70" />
        <rect x="2" y="16.5" width="8" height="4.5" rx="2.25" className="fill-ink-faint/60" />
      </svg>
      {showName && (
        <span className="text-[1.3rem] leading-none font-bold tracking-[-0.03em] [font-stretch:85%]">
          {t('common.appName')}
        </span>
      )}
    </span>
  )
}
