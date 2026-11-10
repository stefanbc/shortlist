import { useTranslation } from 'react-i18next'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { eventPhase, type EventPhase, type EventTiming } from '@/domain/eventPhase'

const TONES: Record<EventPhase, BadgeTone> = {
  setup: 'neutral',
  open: 'success',
  locked: 'warning',
}

export function EventPhaseBadge({ event, now }: { event: EventTiming; now?: Date }) {
  const { t } = useTranslation()
  const phase = eventPhase(event, now ?? new Date())
  return (
    <Badge tone={TONES[phase]} dot={phase === 'open' ? 'live' : false}>
      {t(`events.phase.${phase}`)}
    </Badge>
  )
}
