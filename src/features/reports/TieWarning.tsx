import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import type { TieGroup } from './reportUtils'

export interface TieWarningProps {
  tieGroups: TieGroup[]
  onResolve(rank: number): void
}

/** One warning banner per still-unresolved top-3 tie, each with a button that opens the
 * manual tie-break dialog for that group. Shared between the podium and ranking pages --
 * previously duplicated word-for-word in both. Renders nothing when every tie is
 * resolved. */
export function TieWarning({ tieGroups, onResolve }: TieWarningProps) {
  const { t } = useTranslation()

  return (
    <>
      {tieGroups.map((group) => (
        <div
          key={group.rank}
          className="flex flex-col gap-3 rounded-card bg-warning-soft p-4 ring-1 ring-warning/25 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-warning">
            {t('reports.podiumPage.tieWarning', { count: group.teamIds.length, rank: group.rank })}
          </p>
          <Button variant="secondary" size="sm" onClick={() => onResolve(group.rank)}>
            {t('reports.tieBreak.resolve')}
          </Button>
        </div>
      ))}
    </>
  )
}
