import { ChevronLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet, useParams } from 'react-router'
import type { Id } from '@/domain/types'
import { useEvent } from './api'
import { EventPhaseBadge } from './EventPhaseBadge'
import { EventSubNav } from './EventSubNav'

/** Layout for every `/admin/events/:eventId/*` route (Ruling R16): which event this is
 * and the way back to the list, then the sub-nav, stay visible above whichever page
 * (settings, teams, criteria, jurors, any report) renders below via `Outlet`. The pages
 * themselves only name their section. */
export function EventShell() {
  const { eventId } = useParams<{ eventId: string }>()
  const { t } = useTranslation()
  const { data: event } = useEvent(eventId as Id)

  return (
    <>
      <div className="bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-4 pb-1 sm:px-6 lg:px-10">
          <Link
            to="/admin/events"
            className="-ml-1.5 inline-flex h-9 items-center gap-1 rounded-control pr-2 pl-1 text-sm font-medium text-ink-muted hover:text-ink"
          >
            <ChevronLeft aria-hidden className="size-4" />
            {t('events.title')}
          </Link>
          {event && (
            <>
              <span aria-hidden className="text-line-strong">
                /
              </span>
              <p className="title min-w-0 text-lg break-words">{event.name}</p>
              <EventPhaseBadge event={event} />
            </>
          )}
        </div>
      </div>
      <EventSubNav eventId={eventId as Id} />
      <Outlet />
    </>
  )
}
