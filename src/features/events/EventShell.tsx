import { Outlet, useParams } from 'react-router'
import type { Id } from '@/domain/types'
import { EventSubNav } from './EventSubNav'

/** Layout for every `/admin/events/:eventId/*` route (Ruling R16): the sub-nav stays
 * visible above whichever page (settings, teams, criteria, jurors, any report) renders
 * below it via `Outlet`. */
export function EventShell() {
  const { eventId } = useParams<{ eventId: string }>()
  return (
    <>
      <EventSubNav eventId={eventId as Id} />
      <Outlet />
    </>
  )
}
