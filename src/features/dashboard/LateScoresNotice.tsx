import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { Id } from '@/domain/types'
import { useSetEventStatus } from '@/features/events/api'
import { useLateAttempts } from '@/features/reports/useEventResults'
import type { TeamWithProject } from '@/features/teams/api'
import type { Profile } from '@/stores/session'

type LateScoresNoticeProps = {
  eventId: Id
  teams: TeamWithProject[]
  /** Currently assigned jurors; a late attempt from someone since removed from the event
   * falls back to `dashboard.lateScores.unknownJuror`. */
  jurors: Profile[]
}

/** Scores that reached the server too late to be accepted (offline jurors catching up after
 * the grace window, or after a lock). The organizer reviews them here and can unlock scoring
 * so a juror can re-enter them -- this reopens scoring for everyone, not just these rows. */
export function LateScoresNotice({ eventId, teams, jurors }: LateScoresNoticeProps) {
  const { t } = useTranslation()
  const { data: attempts } = useLateAttempts(eventId)
  const setEventStatus = useSetEventStatus()
  const [confirmOpen, setConfirmOpen] = useState(false)

  if (!attempts || attempts.length === 0) return null

  const teamName = (id: Id) => teams.find((team) => team.id === id)?.name ?? id
  const jurorName = (id: Id) =>
    jurors.find((juror) => juror.id === id)?.displayName ?? t('dashboard.lateScores.unknownJuror')

  async function unlock() {
    try {
      await setEventStatus.mutateAsync({ eventId, override: 'open' })
      toast.success(t('dashboard.lateScores.unlocked'))
    } catch (error) {
      toast.error(t('dashboard.lateScores.unlockError'))
      throw error
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TriangleAlert aria-hidden className="size-5 text-warning" />
          {t('dashboard.lateScores.heading')}
        </CardTitle>
        <Button size="sm" variant="secondary" onClick={() => setConfirmOpen(true)}>
          {t('dashboard.lateScores.unlock')}
        </Button>
      </CardHeader>
      <CardBody className="flex flex-col gap-2">
        <ul className="flex flex-col gap-1.5">
          {attempts.map((attempt) => (
            <li key={`${attempt.jurorId}:${attempt.teamId}`} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-ink">
                {t('dashboard.lateScores.row', {
                  juror: jurorName(attempt.jurorId),
                  team: teamName(attempt.teamId),
                })}
              </span>
              <Badge tone="warning">{attempt.count}</Badge>
            </li>
          ))}
        </ul>
      </CardBody>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('dashboard.lateScores.confirmTitle')}
        description={t('dashboard.lateScores.confirmBody')}
        confirmLabel={t('dashboard.lateScores.unlock')}
        onConfirm={unlock}
      />
    </Card>
  )
}
