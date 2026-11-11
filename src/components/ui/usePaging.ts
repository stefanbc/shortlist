import { useCallback, useState } from 'react'

/** How many rows a long list shows at first, and adds each time. */
export const LIST_PAGE_SIZE = 20

export type Paged<T> = { visible: T[]; hidden: T[]; remaining: number; loadMore(): void }

/**
 * Shows a long list a page at a time. The whole list is already in memory, so this is
 * about keeping the page short and quick to scan, not about fetching. Call the hook at
 * the top of the component, then `paging.of(items)` wherever the list is ready; a search
 * or filter that changes `items` keeps however many rows the person had opened up.
 */
export function usePaging(pageSize = LIST_PAGE_SIZE) {
  const [count, setCount] = useState(pageSize)
  const loadMore = useCallback(() => setCount((current) => current + pageSize), [pageSize])
  return {
    of<T>(items: T[]): Paged<T> {
      return {
        visible: items.slice(0, count),
        hidden: items.slice(count),
        remaining: Math.max(0, items.length - count),
        loadMore,
      }
    },
  }
}
