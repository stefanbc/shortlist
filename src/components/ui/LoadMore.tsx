import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'
import { LIST_PAGE_SIZE } from './usePaging'

type LoadMoreProps = {
  /** Rows not shown yet. Renders nothing at zero. */
  remaining: number
  onLoadMore(): void
  pageSize?: number
}

/** The end of a paged list: loads the next page as it scrolls into view, with a button
 * for keyboards, screen readers and browsers that can't watch scrolling. */
export function LoadMore({ remaining, onLoadMore, pageSize = LIST_PAGE_SIZE }: LoadMoreProps) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node || remaining <= 0 || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore()
      },
      { rootMargin: '200px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [remaining, onLoadMore])

  if (remaining <= 0) return null
  return (
    <div ref={ref} className="flex justify-center pt-2">
      <Button variant="secondary" onClick={onLoadMore}>
        {t('common.showMore', { count: Math.min(pageSize, remaining), remaining })}
      </Button>
    </div>
  )
}
