import { RotateCcw, Trophy } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { Page, PageHeader } from '@/components/layout/Page'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import type { RankedTeam } from '@/domain/scoring'
import type { Id } from '@/domain/types'
import type { TeamWithProject } from '@/features/teams/api'
import { ReportNav } from './ReportNav'
import { unresolvedTieGroups, useScoreFormat } from './reportUtils'
import { TieBreakDialog } from './TieBreakDialog'
import { useEventResults } from './useEventResults'

/** Visual left-to-right order (classic podium shape): 2nd, 1st, 3rd. */
const PLACE_ORDER = [2, 1, 3] as const
/** Reveal order (time): 3rd first, then 2nd, then 1st -- building to the winner. */
const REVEAL_DELAY: Record<number, number> = { 3: 0, 2: 0.35, 1: 0.7 }

interface PodiumSlot {
  rank: number
  entries: RankedTeam[]
}

function podiumSlots(ranked: RankedTeam[]): PodiumSlot[] {
  const slots: PodiumSlot[] = []
  for (const rank of [1, 2, 3]) {
    const entries = ranked.filter((entry) => entry.rank === rank)
    if (entries.length > 0) slots.push({ rank, entries })
  }
  return slots
}

export interface PodiumViewProps {
  eventId: Id
  ranked: RankedTeam[]
  teams: TeamWithProject[]
}

/** The podium: 1st/2nd/3rd with a staggered reveal (respecting reduced motion via the
 * app-wide `MotionConfig`) and a warning + one-tap fix when a top-3 tie is still
 * unresolved. Pure/presentational so it can be rendered directly from fixture or
 * hand-built data in tests, without touching Supabase or routing. */
export function PodiumView({ eventId, ranked, teams }: PodiumViewProps) {
  const { t } = useTranslation()
  const format = useScoreFormat()
  const teamsById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams])
  const [replayKey, setReplayKey] = useState(0)
  const [tieGroupRank, setTieGroupRank] = useState<number | null>(null)

  const slots = useMemo(() => podiumSlots(ranked), [ranked])
  const slotsByRank = useMemo(() => new Map(slots.map((slot) => [slot.rank, slot])), [slots])
  const tieGroups = useMemo(() => unresolvedTieGroups(ranked), [ranked])
  const activeTieGroup = tieGroups.find((group) => group.rank === tieGroupRank) ?? null

  if (slots.length === 0) {
    return (
      <EmptyState
        icon={Trophy}
        title={t('reports.podiumPage.emptyTitle')}
        description={t('reports.podiumPage.emptyBody')}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {tieGroups.map((group) => (
        <div
          key={group.rank}
          className="flex flex-col gap-3 rounded-card bg-warning-soft p-4 ring-1 ring-warning/25 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-warning">
            {t('reports.podiumPage.tieWarning', { count: group.teamIds.length, rank: group.rank })}
          </p>
          <Button variant="secondary" size="sm" onClick={() => setTieGroupRank(group.rank)}>
            {t('reports.tieBreak.resolve')}
          </Button>
        </div>
      ))}

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => setReplayKey((key) => key + 1)}>
          <RotateCcw aria-hidden />
          {t('reports.podiumPage.replay')}
        </Button>
      </div>

      <div key={replayKey} className="grid grid-cols-3 items-end gap-3 sm:gap-6">
        {PLACE_ORDER.map((rank) => {
          const slot = slotsByRank.get(rank)
          if (!slot) return <div key={rank} />
          const tall = rank === 1 ? 'min-h-56' : rank === 2 ? 'min-h-44' : 'min-h-36'
          return (
            <motion.div
              key={rank}
              className="min-w-0"
              initial={{ opacity: 0, y: 24, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: REVEAL_DELAY[rank], type: 'spring', stiffness: 260, damping: 24 }}
            >
              <Card className={`flex flex-col justify-end p-4 sm:p-6 ${tall}`}>
                {rank === 1 && <Trophy aria-hidden className="mb-2 size-7 text-gold" />}
                <span className="numeral text-3xl leading-none text-ink-faint sm:text-4xl">{rank}</span>
                <div className="mt-3 flex flex-col gap-1.5">
                  {slot.entries.map((entry) => {
                    const team = teamsById.get(entry.teamId)
                    return (
                      <div key={entry.teamId}>
                        <p className="truncate text-lg font-bold sm:text-xl">
                          {team?.name ?? entry.teamId}
                        </p>
                        <p className="numeral text-sm text-ink-muted">{format(entry.final)}</p>
                      </div>
                    )
                  })}
                  {slot.entries.length > 1 && (
                    <Badge tone="gold">{t('dashboard.ranking.tieBadge')}</Badge>
                  )}
                </div>
              </Card>
            </motion.div>
          )
        })}
      </div>

      {activeTieGroup && (
        <TieBreakDialog
          eventId={eventId}
          open
          onOpenChange={(open) => !open && setTieGroupRank(null)}
          teams={activeTieGroup.teamIds.flatMap((id) => {
            const team = teamsById.get(id)
            return team ? [team] : []
          })}
        />
      )}
    </div>
  )
}

export function PodiumPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const { t } = useTranslation()
  const id = eventId as Id
  const results = useEventResults(id)

  return (
    <Page>
      <PageHeader title={t('reports.podium')} />
      <ReportNav eventId={id} />
      {results.isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <PodiumView eventId={id} ranked={results.ranked} teams={results.teams} />
      )}
    </Page>
  )
}
