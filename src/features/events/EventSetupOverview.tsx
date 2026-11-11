import type { ParseKeys } from 'i18next'
import { ChevronRight, Gavel, ListChecks, Tags, Users, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import type { Id } from '@/domain/types'
import { useCriteria, useThemes } from '@/features/criteria/api'
import { useTeams } from '@/features/teams/api'
import { useEventJurors } from '@/features/users/api'
import { cn } from '@/lib/cn'

type Item = {
  key: string
  to: string
  icon: LucideIcon
  label: ParseKeys
  count: number | undefined
  /** Shown instead of the count's caption when there is nothing yet and scoring needs it. */
  missing?: ParseKeys
}

/** The event's set-up at a glance: how many teams, criteria, themes and jurors it has,
 * each a link to where they are managed. Anything scoring can't run without is called
 * out, so the organizer sees what is left to do before the day. */
export function EventSetupOverview({ eventId }: { eventId: Id }) {
  const { t } = useTranslation()
  const teams = useTeams(eventId)
  const criteria = useCriteria(eventId)
  const themes = useThemes(eventId)
  const jurors = useEventJurors(eventId)
  const base = `/admin/events/${eventId}`

  const items: Item[] = [
    { key: 'teams', to: `${base}/teams`, icon: Users, label: 'events.overview.teams', count: teams.data?.length, missing: 'events.overview.teamsMissing' },
    { key: 'criteria', to: `${base}/criteria`, icon: ListChecks, label: 'events.overview.criteria', count: criteria.data?.length, missing: 'events.overview.criteriaMissing' },
    { key: 'jurors', to: `${base}/jurors`, icon: Gavel, label: 'events.overview.jurors', count: jurors.data?.length, missing: 'events.overview.jurorsMissing' },
    { key: 'themes', to: `${base}/criteria`, icon: Tags, label: 'events.overview.themes', count: themes.data?.length },
  ]

  return (
    <section aria-label={t('events.overview.heading')}>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {items.map(({ key, to, icon: Icon, label, count, missing }) => {
          const needed = missing !== undefined && count === 0
          return (
            <li key={key}>
              <Link
                to={to}
                className={cn(
                  'group flex h-full items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 transition-colors duration-(--duration-fast) hover:bg-raised',
                  needed && 'border-warning/60 bg-warning-soft hover:bg-warning-soft',
                )}
              >
                <span className="numeral w-10 shrink-0 text-right text-4xl leading-none">
                  {count ?? '–'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Icon aria-hidden className="size-4 shrink-0 text-ink-muted" />
                    {t(label)}
                  </span>
                  {needed && <span className="block text-sm text-warning">{t(missing)}</span>}
                </span>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-faint" />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
