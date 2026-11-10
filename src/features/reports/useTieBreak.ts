import { useMemo, useState } from 'react'
import type { RankedTeam } from '@/domain/scoring'
import { unresolvedTieGroups, type TieGroup } from './reportUtils'

export interface UseTieBreakResult {
  /** Every rank in the top 3 that's still an unresolved tie (see `unresolvedTieGroups`). */
  tieGroups: TieGroup[]
  /** The group the organizer currently has open in the manual tie-break dialog, if any. */
  activeTieGroup: TieGroup | null
  openTieBreak(rank: number): void
  closeTieBreak(): void
}

/** Shared "resolve this top-3 tie" state for the podium and the ranking table: which
 * unresolved tie groups exist, and which one (if any) is currently open in the manual
 * tie-break dialog. Pairs with `<TieWarning>` for the banner and `<TieBreakDialog>` for
 * the dialog itself. */
export function useTieBreak(ranked: RankedTeam[]): UseTieBreakResult {
  const [activeRank, setActiveRank] = useState<number | null>(null)
  const tieGroups = useMemo(() => unresolvedTieGroups(ranked), [ranked])
  const activeTieGroup = tieGroups.find((group) => group.rank === activeRank) ?? null

  return {
    tieGroups,
    activeTieGroup,
    openTieBreak: (rank: number) => setActiveRank(rank),
    closeTieBreak: () => setActiveRank(null),
  }
}
