import { Trophy } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import type { RankedTeam } from '@/domain/scoring'
import type { TeamWithProject } from '@/features/teams/api'
import { cn } from '@/lib/cn'

type LiveRankingProps = {
  ranked: RankedTeam[]
  teams: TeamWithProject[]
}

/** The live ranking: teams ordered by final score, reordering live as scores land.
 * `motion.li`'s `layout` animates the position change (reduced motion is handled app-wide
 * by `MotionConfig reducedMotion="user"` in providers.tsx, so nothing extra is needed here). */
export function LiveRanking({ ranked, teams }: LiveRankingProps) {
  const { t, i18n } = useTranslation()
  const teamsById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams])
  const numberFormat = useMemo(
    () => new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
    [i18n.language],
  )

  if (ranked.length === 0) {
    return (
      <EmptyState
        icon={Trophy}
        title={t('dashboard.ranking.emptyTitle')}
        description={t('dashboard.ranking.emptyBody')}
      />
    )
  }

  return (
    <ol aria-label={t('dashboard.ranking.heading')} className="divide-y divide-line border-y border-line">
      {ranked.map((entry) => {
        const team = teamsById.get(entry.teamId)
        const name = team?.name ?? entry.teamId
        const notScored = entry.final === null && !team?.noShow
        const leads = entry.rank === 1 && entry.final !== null

        return (
          <motion.li
            key={entry.teamId}
            layout
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="flex items-center gap-4 py-3"
          >
            <span
              className={cn(
                'numeral w-8 shrink-0 text-right text-3xl leading-none',
                !leads && 'text-ink-faint',
              )}
            >
              {entry.rank ?? '–'}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={cn('block font-semibold break-words', team?.noShow && 'text-ink-muted line-through')}
              >
                <span className={cn(leads && 'marked-text')}>{name}</span>
              </span>
              <span className="mt-1 flex flex-wrap gap-1.5">
                {team?.noShow && <Badge>{t('teams.noShowBadge')}</Badge>}
                {notScored && <Badge tone="warning">{t('dashboard.ranking.notScoredBadge')}</Badge>}
                {entry.tiedWith.length > 0 && (
                  <Badge tone="gold">{t('dashboard.ranking.tieBadge')}</Badge>
                )}
              </span>
            </span>
            <span className="numeral shrink-0 text-right text-xl tabular-nums">
              {entry.final === null ? '—' : numberFormat.format(entry.final)}
            </span>
          </motion.li>
        )
      })}
    </ol>
  )
}
