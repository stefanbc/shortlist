import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { ParseKeys, TFunction } from 'i18next'
import { eventPhase, type EventTiming, type StatusOverride } from '@/domain/eventPhase'
import { eventInputSchema, type EventInput } from '@/domain/schemas'
import type { Id } from '@/domain/types'
import { supabase } from '@/lib/supabase'

export interface EventRow extends EventTiming {
  id: Id
  name: string
  pitchMinutes: number
  nowPitchingTeamId: Id | null
  nowPitchingSince: string | null
}

const EVENT_COLUMNS =
  'id, name, starts_at, ends_at, status_override, locked_at, pitch_minutes, now_pitching_team_id, now_pitching_since'

type EventDbRow = {
  id: string
  name: string
  starts_at: string
  ends_at: string
  status_override: string
  locked_at: string | null
  pitch_minutes: number
  now_pitching_team_id: string | null
  now_pitching_since: string | null
}

/** Exported for its own unit test; also the only place that knows the DB's snake_case shape. */
export function toEventRow(row: EventDbRow): EventRow {
  return {
    id: row.id,
    name: row.name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    statusOverride: row.status_override as StatusOverride,
    lockedAt: row.locked_at,
    pitchMinutes: row.pitch_minutes,
    nowPitchingTeamId: row.now_pitching_team_id,
    nowPitchingSince: row.now_pitching_since,
  }
}

/** All events visible to the signed-in user (RLS narrows this to assigned events for a juror). */
export function useEvents(): UseQueryResult<EventRow[]> {
  return useQuery({
    queryKey: ['events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select(EVENT_COLUMNS)
        .order('starts_at', { ascending: false })
      if (error) throw error
      return data.map(toEventRow)
    },
  })
}

export function useEvent(id: Id): UseQueryResult<EventRow> {
  return useQuery({
    queryKey: ['events', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select(EVENT_COLUMNS)
        .eq('id', id)
        .single()
      if (error) throw error
      return toEventRow(data)
    },
    enabled: Boolean(id),
  })
}

/** Keeps the cached event live: subscribes to Realtime UPDATEs of the event's row (who is
 * pitching, open/lock overrides, dates) and writes each new row into `['events', id]`.
 * The channel is removed on unmount. */
export function useEventUpdates(eventId: Id): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!eventId) return
    const channel = supabase
      .channel(`event:${eventId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${eventId}` },
        (payload) => {
          queryClient.setQueryData(['events', eventId], toEventRow(payload.new as EventDbRow))
          void queryClient.invalidateQueries({ queryKey: ['events'], exact: true })
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [eventId, queryClient])
}

/** Creates a blank event (no `id`) or updates an existing one's name/dates/pitch length. */
export function useSaveEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: EventInput & { id?: Id }): Promise<EventRow> => {
      const payload = {
        name: input.name,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        pitch_minutes: input.pitchMinutes,
      }
      const { data, error } = input.id
        ? await supabase.from('events').update(payload).eq('id', input.id).select(EVENT_COLUMNS).single()
        : await supabase.from('events').insert(payload).select(EVENT_COLUMNS).single()
      if (error) throw error
      return toEventRow(data)
    },
    onSuccess: (event) => {
      void queryClient.invalidateQueries({ queryKey: ['events'] })
      queryClient.setQueryData(['events', event.id], event)
    },
  })
}

export function useSetEventStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ eventId, override }: { eventId: Id; override: StatusOverride }) => {
      const { error } = await supabase.rpc('set_event_status', {
        p_event: eventId,
        p_override: override,
      })
      if (error) throw error
    },
    onSuccess: (_data, { eventId }) => {
      void queryClient.invalidateQueries({ queryKey: ['events'] })
      void queryClient.invalidateQueries({ queryKey: ['events', eventId] })
    },
  })
}

/** Creates a new event, copying the source event's themes and criteria (not teams or jurors). */
export function useCopyEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      sourceId,
      name,
      startsAt,
      endsAt,
    }: {
      sourceId: Id
      name: string
      startsAt: string
      endsAt: string
    }): Promise<Id> => {
      const { data, error } = await supabase.rpc('copy_event_setup', {
        p_source: sourceId,
        p_name: name,
        p_starts: startsAt,
        p_ends: endsAt,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['events'] })
    },
  })
}

export function useSetNowPitching() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ eventId, teamId }: { eventId: Id; teamId: Id | null }) => {
      const { error } = await supabase.rpc('set_now_pitching', {
        p_event: eventId,
        // The generated RPC type is too strict: the DB function accepts null to clear
        // who's pitching (see supabase/migrations/0003_rpc.sql).
        p_team: teamId as string,
      })
      if (error) throw error
    },
    onSuccess: (_data, { eventId }) => {
      void queryClient.invalidateQueries({ queryKey: ['events', eventId] })
    },
  })
}

/** The event to show by default: the open one, else the soonest upcoming one, else the
 * most recently started one. Works for both the admin dashboard (sees every event) and
 * the juror home (RLS already narrows the list to assigned events). */
export function useActiveEvent(): EventRow | null {
  const { data } = useEvents()
  if (!data || data.length === 0) return null

  const now = new Date()
  const byPhase = (phase: ReturnType<typeof eventPhase>) =>
    data.filter((event) => eventPhase(event, now) === phase)

  const open = byPhase('open')
  if (open.length > 0) return open[0]

  const upcoming = byPhase('setup').sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  )
  if (upcoming.length > 0) return upcoming[0]

  // `data` is already ordered by starts_at descending, so the most recent comes first.
  return data[0]
}

/** Converts an ISO instant to the local `YYYY-MM-DDTHH:mm` value a datetime-local input needs. */
export function toDateTimeLocal(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Converts a datetime-local input's local value to an ISO instant, or '' if unparsable. */
export function fromDateTimeLocal(local: string): string {
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

export type EventFormState = { name: string; startsAt: string; endsAt: string; pitchMinutes: string }

/** Field-level validation failures, as translation-ready codes (never translated strings) so
 * this module stays free of a `t` dependency; callers translate via EVENT_FORM_ERROR_KEYS. */
export type EventFormErrorCode =
  | 'nameRequired'
  | 'invalidDate'
  | 'endsBeforeStart'
  | 'pitchMinutesRange'
  | 'noSource'
export type EventFormErrors = Partial<Record<keyof EventFormState, EventFormErrorCode>>

export const EVENT_FORM_ERROR_KEYS: Record<EventFormErrorCode, ParseKeys> = {
  nameRequired: 'events.errorNameRequired',
  invalidDate: 'events.errorInvalidDate',
  endsBeforeStart: 'events.errorEndsBeforeStart',
  pitchMinutesRange: 'events.errorPitchMinutesRange',
  noSource: 'events.errorNoSource',
}

/** Translates a field's error code, or returns undefined for no error. The one shared
 * lookup behind every form's per-field `error={...}` prop. */
export function eventFieldErrorMessage(
  t: TFunction,
  code: EventFormErrorCode | undefined,
): string | undefined {
  return code ? t(EVENT_FORM_ERROR_KEYS[code]) : undefined
}

export function toEventFormState(event: {
  name: string
  startsAt: string
  endsAt: string
  pitchMinutes: number
}): EventFormState {
  return {
    name: event.name,
    startsAt: toDateTimeLocal(event.startsAt),
    endsAt: toDateTimeLocal(event.endsAt),
    pitchMinutes: String(event.pitchMinutes),
  }
}

/** Validates a name/dates/pitch-minutes form against `eventInputSchema`, mapping zod issues
 * to field-level error codes instead of translated text. */
export function validateEventForm(
  form: EventFormState,
): { data: EventInput } | { errors: EventFormErrors } {
  const result = eventInputSchema.safeParse({
    name: form.name,
    startsAt: fromDateTimeLocal(form.startsAt),
    endsAt: fromDateTimeLocal(form.endsAt),
    pitchMinutes: Number(form.pitchMinutes),
  })
  if (result.success) return { data: result.data }

  const errors: EventFormErrors = {}
  for (const issue of result.error.issues) {
    const field = issue.path[0]
    if (field === 'endsAt') {
      errors.endsAt ??= issue.code === 'custom' ? 'endsBeforeStart' : 'invalidDate'
    } else if (field === 'startsAt') {
      errors.startsAt ??= 'invalidDate'
    } else if (field === 'name') {
      errors.name ??= 'nameRequired'
    } else if (field === 'pitchMinutes') {
      errors.pitchMinutes ??= 'pitchMinutesRange'
    }
  }
  return { errors }
}

export type CopyEventFormErrors = Partial<
  Record<'sourceId' | 'name' | 'startsAt' | 'endsAt', EventFormErrorCode>
>

/** Validates the lighter copy-event form: source/name/dates only (no pitch length — the
 * `copy_event_setup` RPC doesn't take one, so `eventInputSchema` doesn't apply here). */
export function validateCopyEventForm(form: {
  sourceId: string
  name: string
  startsAt: string
  endsAt: string
}): CopyEventFormErrors | null {
  const errors: CopyEventFormErrors = {}
  if (!form.sourceId) errors.sourceId = 'noSource'
  if (!form.name.trim()) errors.name = 'nameRequired'

  const startsAt = fromDateTimeLocal(form.startsAt)
  const endsAt = fromDateTimeLocal(form.endsAt)
  if (!startsAt) errors.startsAt = 'invalidDate'
  if (!endsAt) errors.endsAt = 'invalidDate'
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
    errors.endsAt = 'endsBeforeStart'
  }

  return Object.keys(errors).length > 0 ? errors : null
}
