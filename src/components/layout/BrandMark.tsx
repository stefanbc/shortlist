import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'

/** The Shortlist mark: a list of three, the first one gone over with a highlighter. */
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
      <svg viewBox="0 0 28 24" aria-hidden className="h-6 w-7 shrink-0">
        <path d="M1.5 2.2 25.6.9l1 7.3L.9 9.4Z" className="fill-mark" />
        <rect x="5" y="4" width="17" height="2.6" rx="1.3" className="fill-on-mark" />
        <rect x="5" y="12.2" width="12" height="2.6" rx="1.3" className="fill-current opacity-75" />
        <rect x="5" y="19" width="7" height="2.6" rx="1.3" className="fill-current opacity-45" />
      </svg>
      {showName && (
        <span className="text-[1.25rem] leading-none font-extrabold tracking-[-0.03em] [font-stretch:118%]">
          {t('common.appName')}
        </span>
      )}
    </span>
  )
}
