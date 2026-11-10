import type { ReactNode } from 'react'
import { Page, PageHeader } from '@/components/layout/Page'
import { Skeleton } from '@/components/ui/Skeleton'
import type { Id } from '@/domain/types'
import { ReportNav } from './ReportNav'

export interface ReportPageProps {
  eventId: Id
  title: ReactNode
  loading: boolean
  children: ReactNode
}

/** Shared wrapper for the four tabbed report routes (podium, ranking, criteria, jurors):
 * page title, the `ReportNav` tab strip, and a loading skeleton while `useEventResults`
 * is still fetching. Previously this exact block (`Page` > `PageHeader` > `ReportNav` >
 * loading-or-content) was duplicated in each of the four route components. The team
 * breakdown route isn't one of these four -- it has its own back-link/not-found states
 * and no `ReportNav` -- so it keeps its own wrapper rather than being forced into this
 * shape. */
export function ReportPage({ eventId, title, loading, children }: ReportPageProps) {
  return (
    <Page>
      <PageHeader title={title} />
      <ReportNav eventId={eventId} />
      {loading ? <Skeleton className="h-72 w-full" /> : children}
    </Page>
  )
}
