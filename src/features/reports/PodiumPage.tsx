import { RotateCcw, Trophy } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import type { RankedTeam } from '@/domain/scoring'
import type { Id } from '@/domain/types'
import type { TeamWithProject } from '@/features/teams/api'
import { cn } from '@/lib/cn'
import { resolveTeams, useScoreFormat } from './reportUtils'
import { ReportPage } from './ReportPage'
import { TieBreakDialog } from './TieBreakDialog'
import { TieWarning } from './TieWarning'
import { useEventResults } from './useEventResults'
import { useTieBreak } from './useTieBreak'

/** Visual left-to-right order (classic podium shape): 2nd, 1st, 3rd. */
const PLACE_ORDER = [2, 1, 3] as const
/** Reveal order (time): 3rd first, then 2nd, then 1st -- building to the winner. */
const REVEAL_DELAY: Record<number, number> = { 3: 0, 2: 0.35, 1: 0.7 }

/** How many places after third are listed under the podium. */
const RUNNERS_UP = 7

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
  const { tieGroups, activeTieGroup, openTieBreak, closeTieBreak } = useTieBreak(ranked)

  const slots = useMemo(() => podiumSlots(ranked), [ranked])
  const slotsByRank = useMemo(() => new Map(slots.map((slot) => [slot.rank, slot])), [slots])

  // The places just off the podium, for announcing honourable mentions.
  const runnersUp = ranked
    .filter((entry) => entry.rank !== null && entry.rank > 3 && entry.final !== null)
    .slice(0, RUNNERS_UP)

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
      <TieWarning tieGroups={tieGroups} onResolve={openTieBreak} />

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => setReplayKey((key) => key + 1)}>
          <RotateCcw aria-hidden />
          {t('reports.podiumPage.replay')}
        </Button>
      </div>

      {/* Only the places that exist get a column: a tie for second leaves no third. */}
      <div
        key={replayKey}
        className={cn(
          'grid items-end gap-3 sm:gap-6',
          slots.length >= 3 ? 'grid-cols-3' : slots.length === 2 ? 'grid-cols-2' : 'grid-cols-1',
        )}
      >
        {PLACE_ORDER.map((rank) => {
          const slot = slotsByRank.get(rank)
          if (!slot) return null
          const tall = rank === 1 ? 'min-h-64' : rank === 2 ? 'min-h-48' : 'min-h-40'
          return (
            <motion.div
              key={rank}
              className="min-w-0"
              initial={{ opacity: 0, y: 24, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: REVEAL_DELAY[rank], type: 'spring', stiffness: 260, damping: 24 }}
            >
              <Card
                className={cn(
                  'flex flex-col justify-end p-4 sm:p-6',
                  tall,
                  rank === 1 && 'marked border-transparent bg-mark text-on-mark',
                )}
              >
                {rank === 1 && <Trophy aria-hidden className="mb-2 size-7" />}
                <span
                  className={cn(
                    'numeral text-5xl leading-none sm:text-6xl',
                    rank !== 1 && 'text-ink-faint',
                  )}
                >
                  {rank}
                </span>
                <div className="mt-3 flex flex-col gap-1.5">
                  {slot.entries.map((entry) => {
                    const team = teamsById.get(entry.teamId)
                    return (
                      <div key={entry.teamId}>
                        <p className="title text-lg break-words sm:text-2xl">
                          {team?.name ?? entry.teamId}
                        </p>
                        <p className={cn('numeral text-lg', rank !== 1 && 'text-ink-muted')}>
                          {format(entry.final)}
                        </p>
                      </div>
                    )
                  })}
                  {slot.entries.length > 1 && (
                    <Badge tone={rank === 1 ? 'neutral' : 'gold'} className="self-start">
                      {t('dashboard.ranking.tieBadge')}
                    </Badge>
                  )}
                </div>
              </Card>
            </motion.div>
          )
        })}
      </div>

      {runnersUp.length > 0 && (
        <section aria-labelledby="runners-up-heading">
          <h2 id="runners-up-heading" className="mb-2 text-lg font-semibold">
            {t('reports.podiumPage.runnersUp')}
          </h2>
          <ol className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {runnersUp.map((entry) => {
              const team = teamsById.get(entry.teamId)
              return (
                <li key={entry.teamId} className="flex items-center gap-4 px-4 py-2.5">
                  <span className="numeral w-8 shrink-0 text-right text-2xl leading-none text-ink-faint">
                    {entry.rank}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold break-words">{team?.name ?? entry.teamId}</span>
                    {team?.project.name && (
                      <span className="block text-sm text-ink-muted">{team.project.name}</span>
                    )}
                  </span>
                  <span className="numeral shrink-0 text-lg">{format(entry.final)}</span>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      {activeTieGroup && (
        <TieBreakDialog
          eventId={eventId}
          open
          onOpenChange={(open) => !open && closeTieBreak()}
          teams={resolveTeams(activeTieGroup.teamIds, teamsById)}
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
    <ReportPage eventId={id} title={t('reports.podium')} loading={results.isLoading}>
      <PodiumView eventId={id} ranked={results.ranked} teams={results.teams} />
    </ReportPage>
  )
}
