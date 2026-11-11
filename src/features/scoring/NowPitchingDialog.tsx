import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { Id } from '@/domain/types'
import type { EventRow } from '@/features/events/api'
import type { TeamWithProject } from '@/features/teams/api'

type NowPitchingDialogProps = {
  event: EventRow | undefined
  teams: TeamWithProject[]
  /** The team on screen; null on the team list. */
  currentTeamId: Id | null
}

/** One "now pitching" announcement: the same team set again later is a new change. */
const changeId = (event: EventRow) =>
  event.nowPitchingTeamId ? `${event.nowPitchingTeamId}@${event.nowPitchingSince ?? ''}` : null

/** Asks "Team X is now pitching — switch?" whenever the organizer moves the stage to a team
 * other than the one on screen. Switch opens that team; Stay dismisses this change only.
 * Whoever is already pitching when the screen opens is not announced. */
export function NowPitchingDialog({ event, teams, currentTeamId }: NowPitchingDialogProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const seen = useRef<string | null | undefined>(undefined)
  const [asking, setAsking] = useState<{ teamId: Id; eventId: Id } | null>(null)

  const current = event ? changeId(event) : undefined

  useEffect(() => {
    if (!event || current === undefined) return
    const first = seen.current === undefined
    if (seen.current === current) return
    seen.current = current
    if (first || !event.nowPitchingTeamId || event.nowPitchingTeamId === currentTeamId) {
      setAsking(null)
      return
    }
    setAsking({ teamId: event.nowPitchingTeamId, eventId: event.id })
  }, [event, current, currentTeamId])

  const team = asking ? teams.find((candidate) => candidate.id === asking.teamId) : undefined
  // Already looking at that team (e.g. the juror opened it by hand): nothing to ask.
  const open = Boolean(asking && team && asking.teamId !== currentTeamId)

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setAsking(null)
      }}
      title={t('scoring.nowPitchingDialog.title', { team: team?.name ?? '' })}
      description={t('scoring.nowPitchingDialog.description', { team: team?.name ?? '' })}
      confirmLabel={t('scoring.nowPitchingDialog.switch')}
      cancelLabel={t('scoring.nowPitchingDialog.stay')}
      onConfirm={() => {
        if (asking) void navigate(`/score/${asking.eventId}/${asking.teamId}`)
      }}
    />
  )
}
