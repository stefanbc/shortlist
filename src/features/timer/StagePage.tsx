import { ArrowLeft, Maximize, Minimize, SkipForward } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { BrandMark } from '@/components/layout/BrandMark'
import { Button } from '@/components/ui/Button'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { formatClock } from '@/domain/pitchTimer'
import type { Id } from '@/domain/types'
import { useEvent, useEventUpdates, useSetNowPitching, type EventRow } from '@/features/events/api'
import { useTeams } from '@/features/teams/api'
import { cn } from '@/lib/cn'
import { TimerControls } from './TimerControls'
import { useTimerActions } from './useTimerActions'
import { useTimerView } from './useTimerView'

/** How long the controls and pointer stay visible after the mouse last moved. */
const IDLE_MS = 3000

/** Keeps the projector's screen from sleeping while the page is showing. */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    async function acquire() {
      if (document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return
      try {
        const next = await navigator.wakeLock.request('screen')
        if (cancelled) void next.release()
        else lock = next
      } catch {
        // Refused (battery saver, unsupported): the timer still works, the screen may dim.
      }
    }
    void acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', acquire)
      void lock?.release()
    }
  }, [])
}

function useFullscreen() {
  const [fullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement))
  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen?.()
    else void document.documentElement.requestFullscreen?.().catch(() => {})
  }, [])
  return { fullscreen, toggle }
}

/** The projector page: the team on stage and the shared clock, as large as the screen
 * allows. Always on the chalkboard palette, whatever theme the organizer uses. */
export function StagePage() {
  const { eventId = '' } = useParams()
  useEventUpdates(eventId)
  const { data: event } = useEvent(eventId)

  return (
    <div className="dark min-h-svh bg-canvas text-ink">
      {event ? <Stage event={event} /> : <div className="min-h-svh" aria-busy="true" />}
    </div>
  )
}

function Stage({ event }: { event: EventRow }) {
  const { t } = useTranslation()
  const { data: teams } = useTeams(event.id as Id)
  const setNowPitching = useSetNowPitching()
  const view = useTimerView(event.timer, event.pitchMinutes)
  const { run } = useTimerActions(event.id)
  const { fullscreen, toggle: toggleFullscreen } = useFullscreen()
  useWakeLock()

  const pitching = (teams ?? []).filter((team) => !team.noShow)
  const currentIndex = pitching.findIndex((team) => team.id === event.nowPitchingTeamId)
  const current = teams?.find((team) => team.id === event.nowPitchingTeamId) ?? null
  const next = currentIndex === -1 ? (current ? undefined : pitching[0]) : pitching[currentIndex + 1]

  // Controls and pointer show while the mouse moves, then get out of the audience's way.
  const [active, setActive] = useState(true)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wake = useCallback(() => {
    setActive(true)
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setActive(false), IDLE_MS)
  }, [])
  useEffect(() => {
    idleTimer.current = setTimeout(() => setActive(false), IDLE_MS)
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current)
    }
  }, [])

  const phase = view.phase
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (event.key === ' ' && target?.closest('button, a, input, select, textarea')) return
      if (event.key === ' ') {
        event.preventDefault()
        run(phase === 'running' ? 'pause' : 'start')
      } else if (event.key.toLowerCase() === 'f') {
        toggleFullscreen()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, run, toggleFullscreen])

  const clock = formatClock(view.remainingMs)
  const state = view.over
    ? t('timer.over')
    : phase === 'paused'
      ? t('timer.paused')
      : phase === 'ready'
        ? t('timer.ready')
        : null

  return (
    <main
      onMouseMove={wake}
      onFocus={wake}
      className={cn('flex min-h-svh flex-col', !active && 'cursor-none')}
    >
      <title>{`${current?.name ?? event.name} | ${t('timer.stageTitle')}`}</title>

      <header className="flex items-start justify-between gap-6 px-[4vw] pt-[4vh]">
        <div className="min-w-0">
          <p className="text-[clamp(1rem,1.6vw,1.75rem)] text-ink-muted">
            {current ? t('timer.nowPitching') : event.name}
          </p>
          <h1 className="text-[clamp(2rem,5.5vw,6rem)] leading-[1.05] break-words">
            {current ? current.name : t('timer.noTeam')}
          </h1>
          {current?.project.name && (
            <p className="mt-[1vh] text-[clamp(1.1rem,2.2vw,2.5rem)] text-ink-muted">{current.project.name}</p>
          )}
        </div>
        <BrandMark className="shrink-0 pt-2 text-ink-muted" showName={false} />
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-[4vw]">
        <p
          role="timer"
          aria-label={view.over ? t('timer.clockOver', { time: clock }) : t('timer.clockLeft', { time: clock })}
          className={cn(
            'numeral text-[clamp(7rem,30vw,44vh)] leading-[0.9]',
            view.over && 'text-danger',
            view.closing && 'marked px-[3vw]',
            phase === 'paused' && !view.closing && !view.over && 'text-ink-muted',
          )}
        >
          {view.over && '+'}
          {clock}
        </p>
        <p className="mt-[2vh] h-[1.2em] text-[clamp(1.1rem,2.4vw,2.75rem)] font-semibold text-ink-muted">
          {state}
        </p>
      </div>

      <footer className="px-[4vw] pb-[4vh]">
        <div className="mb-[2vh] flex min-h-14 flex-wrap items-end justify-between gap-4">
          <p className="text-[clamp(1rem,1.6vw,1.75rem)] text-ink-muted">
            {next && t('timer.nextUp', { team: next.name })}
          </p>
          <div
            className={cn(
              'flex flex-wrap items-center gap-2 transition-opacity duration-(--duration-base) focus-within:opacity-100',
              active ? 'opacity-100' : 'pointer-events-none opacity-0 focus-within:pointer-events-auto',
            )}
          >
            <TimerControls eventId={event.id} phase={phase} />
            <Button
              variant="secondary"
              disabled={!next || setNowPitching.isPending}
              onClick={() => {
                if (!next) return
                setNowPitching.mutate(
                  { eventId: event.id, teamId: next.id },
                  { onError: () => toast.error(t('dashboard.nowPitching.error')) },
                )
              }}
            >
              <SkipForward aria-hidden />
              {t('timer.nextTeam')}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={fullscreen ? t('timer.exitFullscreen') : t('timer.fullscreen')}
              title={t('timer.keysHint')}
              onClick={toggleFullscreen}
            >
              {fullscreen ? <Minimize aria-hidden /> : <Maximize aria-hidden />}
            </Button>
            <Link to="/admin" className={buttonClasses({ variant: 'ghost', size: 'icon' })} aria-label={t('timer.backToLive')}>
              <ArrowLeft aria-hidden />
            </Link>
          </div>
        </div>
        <div aria-hidden className="h-[1.2vh] min-h-1.5 overflow-hidden rounded-full bg-raised">
          <div
            className={cn('h-full rounded-full bg-accent', view.closing && 'bg-mark', view.over && 'bg-danger')}
            style={{ width: `${view.progress * 100}%` }}
          />
        </div>
      </footer>
    </main>
  )
}
