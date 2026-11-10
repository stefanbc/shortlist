import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { criterionStats, jurorStats, type CriterionStat, type JurorStat } from '@/domain/analytics'
import { rankTeams, type RankedTeam } from '@/domain/scoring'
import type { Criterion, Id, Score } from '@/domain/types'
import { useCriteria } from '@/features/criteria/api'
import { useTeams, type TeamWithProject } from '@/features/teams/api'
import { useEventJurors } from '@/features/users/api'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/stores/session'

const SCORE_COLUMNS = 'team_id, criterion_id, juror_id, value, updated_at'
/** PostgREST's default row cap; an event can have ~20 teams x 9 criteria x 7 jurors ~= 1260
 * score rows, past that cap, so fetchAllScores pages through it. */
const SCORES_PAGE_SIZE = 1000
/** Collapses a burst of near-simultaneous taps (several jurors scoring at once) into one
 * refetch instead of one per row. */
const SCORES_DEBOUNCE_MS = 300

type ScoreDbRow = {
  team_id: string
  criterion_id: string
  juror_id: string
  value: number
  updated_at: string
}

/** Exported for its own unit test; also the only place that knows the DB's snake_case shape. */
export function toScoreRow(row: ScoreDbRow): Score & { updatedAt: string } {
  return {
    teamId: row.team_id,
    criterionId: row.criterion_id,
    jurorId: row.juror_id,
    value: row.value,
    updatedAt: row.updated_at,
  }
}

/** Fetches every score row for the event, paging past `SCORES_PAGE_SIZE` rather than
 * silently truncating at PostgREST's default limit. */
async function fetchAllScores(eventId: Id): Promise<ScoreDbRow[]> {
  const rows: ScoreDbRow[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('scores')
      .select(SCORE_COLUMNS)
      .eq('event_id', eventId)
      .range(from, from + SCORES_PAGE_SIZE - 1)
    if (error) throw error
    const page = data as ScoreDbRow[]
    rows.push(...page)
    if (page.length < SCORES_PAGE_SIZE) break
    from += SCORES_PAGE_SIZE
  }
  return rows
}

/** Distinguishes each subscription's topic -- see useEventUpdates in events/api.ts for why a
 * shared topic silently breaks across navigation. */
let scoresSubscriptionSeq = 0

/** Every score for the event (admin-only: RLS lets `events.manage`/`reports.view` see every
 * juror's rows, not just their own). Kept live by a Realtime subscription on `scores` filtered
 * to this event -- any insert/update/delete invalidates the query, debounced so several
 * jurors tapping at once causes one refetch instead of many. */
export function useEventScores(eventId: Id): UseQueryResult<(Score & { updatedAt: string })[]> {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['scores', 'event', eventId],
    queryFn: async () => (await fetchAllScores(eventId)).map(toScoreRow),
    enabled: Boolean(eventId),
  })

  useEffect(() => {
    if (!eventId) return
    let timer: ReturnType<typeof setTimeout> | null = null
    // DELETE payloads carry no columns worth reading here -- every change just invalidates.
    const scheduleInvalidate = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ['scores', 'event', eventId] })
      }, SCORES_DEBOUNCE_MS)
    }
    const channel = supabase
      .channel(`scores:${eventId}:${++scoresSubscriptionSeq}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scores', filter: `event_id=eq.${eventId}` },
        scheduleInvalidate,
      )
      .subscribe()
    return () => {
      if (timer) clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [eventId, queryClient])

  return query
}

/** One juror's late attempts on one team, for the LateScoresNotice. */
export interface LateAttemptGroup {
  jurorId: Id
  teamId: Id
  count: number
}

type LateAttemptDbRow = { juror_id: string; team_id: string }

/** Exported for its own unit test. */
export function toLateAttemptGroups(rows: LateAttemptDbRow[]): LateAttemptGroup[] {
  const groups = new Map<string, LateAttemptGroup>()
  for (const row of rows) {
    const key = `${row.juror_id}:${row.team_id}`
    const existing = groups.get(key)
    if (existing) existing.count += 1
    else groups.set(key, { jurorId: row.juror_id, teamId: row.team_id, count: 1 })
  }
  return Array.from(groups.values())
}

/** Late score attempts for the event, grouped by juror + team. */
export function useLateAttempts(eventId: Id): UseQueryResult<LateAttemptGroup[]> {
  return useQuery({
    queryKey: ['late-attempts', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('late_score_attempts')
        .select('juror_id, team_id')
        .eq('event_id', eventId)
      if (error) throw error
      return toLateAttemptGroups(data as LateAttemptDbRow[])
    },
    enabled: Boolean(eventId),
  })
}

export interface EventResults {
  ranked: RankedTeam[]
  criteria: Criterion[]
  teams: TeamWithProject[]
  jurors: Profile[]
  scores: Score[]
  criterionStats: CriterionStat[]
  jurorStats: JurorStat[]
  isLoading: boolean
}

/** Combines an event's teams, criteria, assigned jurors and live scores into the ranking
 * and analytics the organizer dashboard (and later report pages) read. Scores from a juror
 * no longer assigned to the event still count here (the Mirela -> Ovidia swap), even though
 * `jurors` only lists who's currently assigned. */
export function useEventResults(eventId: Id): EventResults {
  const { data: teams, isLoading: teamsLoading } = useTeams(eventId)
  const { data: criteria, isLoading: criteriaLoading } = useCriteria(eventId)
  const { data: jurors, isLoading: jurorsLoading } = useEventJurors(eventId)
  const { data: scoreRows, isLoading: scoresLoading } = useEventScores(eventId)

  const scores: Score[] = useMemo(() => scoreRows ?? [], [scoreRows])

  const ranked = useMemo(
    () => rankTeams(teams ?? [], criteria ?? [], scores),
    [teams, criteria, scores],
  )
  const stats = useMemo(() => criterionStats(criteria ?? [], scores), [criteria, scores])
  const perJuror = useMemo(() => jurorStats(scores), [scores])

  return {
    ranked,
    criteria: criteria ?? [],
    teams: teams ?? [],
    jurors: jurors ?? [],
    scores,
    criterionStats: stats,
    jurorStats: perJuror,
    isLoading: teamsLoading || criteriaLoading || jurorsLoading || scoresLoading,
  }
}
