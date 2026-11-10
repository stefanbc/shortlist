import { FunctionsHttpError } from '@supabase/supabase-js'
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { ParseKeys, TFunction } from 'i18next'
import { userInputSchema, type UserInput } from '@/domain/schemas'
import type { Id } from '@/domain/types'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/stores/session'

const PLACEHOLDER_EMAIL_SUFFIX = '@jurors.shortlist.invalid'

/** A juror created without a real address gets one of these (see `admin-users`'
 * `placeholderEmail()`). Never shown as-is -- the UI reads it as "no email". */
export function isPlaceholderEmail(email: string | null): boolean {
  return email !== null && email.endsWith(PLACEHOLDER_EMAIL_SUFFIX)
}

const PROFILE_COLUMNS = 'id, display_name, email, role, active'

type ProfileDbRow = {
  id: string
  display_name: string
  email: string | null
  role: string
  active: boolean
}

/** Exported for its own unit test; also the only place in this feature that knows the
 * DB's snake_case shape. Rows with an unrecognized role (shouldn't happen -- `role`
 * references the `roles` table) are dropped rather than shown half-mapped. */
export function toProfile(row: ProfileDbRow): Profile | null {
  if (row.role !== 'admin' && row.role !== 'juror') return null
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    role: row.role,
    active: row.active,
  }
}

/** Every user in the system, for the organizer's people list. */
export function useProfiles(): UseQueryResult<Profile[]> {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .order('display_name', { ascending: true })
      if (error) throw error
      return (data as ProfileDbRow[]).flatMap((row) => toProfile(row) ?? [])
    },
  })
}

type EventJurorNameRow = { juror_id: string; events: { name: string } | null }

/** Every juror's assigned event names, keyed by juror id -- the "events judged" column
 * on the people list. A juror with no rows here simply has no key in the result. */
export function useJurorEventNames(): UseQueryResult<Record<Id, string[]>> {
  return useQuery({
    queryKey: ['event-jurors', 'by-juror'],
    queryFn: async () => {
      const { data, error } = await supabase.from('event_jurors').select('juror_id, events(name)')
      if (error) throw error
      const byJuror: Record<Id, string[]> = {}
      for (const row of data as unknown as EventJurorNameRow[]) {
        if (!row.events) continue
        ;(byJuror[row.juror_id] ??= []).push(row.events.name)
      }
      return byJuror
    },
  })
}

type EventJurorProfileRow = { profiles: ProfileDbRow | null }

/** The jurors assigned to one event, for the event's juror-assignment screen. */
export function useEventJurors(eventId: Id): UseQueryResult<Profile[]> {
  return useQuery({
    queryKey: ['event-jurors', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_jurors')
        .select(`profiles(${PROFILE_COLUMNS})`)
        .eq('event_id', eventId)
      if (error) throw error
      return (data as unknown as EventJurorProfileRow[]).flatMap(
        (row) => (row.profiles && toProfile(row.profiles)) ?? [],
      )
    },
    enabled: Boolean(eventId),
  })
}

export function useAssignJuror() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ eventId, jurorId }: { eventId: Id; jurorId: Id }) => {
      const { error } = await supabase
        .from('event_jurors')
        .insert({ event_id: eventId, juror_id: jurorId })
      if (error) throw error
    },
    onSuccess: (_data, { eventId }) => {
      void queryClient.invalidateQueries({ queryKey: ['event-jurors', eventId] })
      void queryClient.invalidateQueries({ queryKey: ['event-jurors', 'by-juror'] })
    },
  })
}

/** Unassigns a juror from an event. Their scores already entered for it are untouched
 * and keep counting toward results (the Mirela -> Ovidia swap) -- this only stops them
 * from judging it going forward. */
export function useUnassignJuror() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ eventId, jurorId }: { eventId: Id; jurorId: Id }) => {
      const { error } = await supabase
        .from('event_jurors')
        .delete()
        .eq('event_id', eventId)
        .eq('juror_id', jurorId)
      if (error) throw error
    },
    onSuccess: (_data, { eventId }) => {
      void queryClient.invalidateQueries({ queryKey: ['event-jurors', eventId] })
      void queryClient.invalidateQueries({ queryKey: ['event-jurors', 'by-juror'] })
    },
  })
}

/** Machine-readable reasons `admin-users` can refuse a create/set_active/set_email call. */
export type UserActionErrorCode =
  | 'email_exists'
  | 'cannot_deactivate_self'
  | 'not_found'
  | 'unknown'

/** Non-2xx responses from the edge function arrive as a FunctionsHttpError whose body
 * carries the machine-readable reason; anything else (network failure, bad JSON)
 * collapses to 'unknown'. */
async function toUserActionError(error: unknown): Promise<Error & { code: UserActionErrorCode }> {
  let code: UserActionErrorCode = 'unknown'
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: string }
      if (
        body.error === 'email_exists' ||
        body.error === 'cannot_deactivate_self' ||
        body.error === 'not_found'
      ) {
        code = body.error
      }
    } catch {
      // Body wasn't JSON -- fall through to the generic reason.
    }
  }
  return Object.assign(new Error(code), { code })
}

export const USER_ACTION_ERROR_KEYS: Record<UserActionErrorCode, ParseKeys> = {
  email_exists: 'users.emailExists',
  cannot_deactivate_self: 'users.cannotDeactivateSelf',
  not_found: 'users.notFound',
  unknown: 'users.actionError',
}

/** Translates a UserActionErrorCode (thrown by useCreateUser/useSetUserActive/
 * useSetUserEmail) into user-facing copy. */
export function userActionErrorMessage(t: TFunction, code: UserActionErrorCode): string {
  return t(USER_ACTION_ERROR_KEYS[code])
}

/** Reads the `code` a caught useCreateUser/useSetUserActive/useSetUserEmail rejection
 * carries, for callers that just want to show `userActionErrorMessage(t, ...)` for
 * whatever went wrong (including errors with no `code`, e.g. a network failure). */
export function userActionErrorCode(error: unknown): UserActionErrorCode {
  if (error && typeof error === 'object' && 'code' in error) {
    const { code } = error as { code: unknown }
    if (code === 'email_exists' || code === 'cannot_deactivate_self' || code === 'not_found') {
      return code
    }
  }
  return 'unknown'
}

/** Creates a user via the `admin-users` edge function (service role only -- it's the
 * only way to create an `auth.users` row). */
export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UserInput): Promise<Id> => {
      const { data, error } = await supabase.functions.invoke<{ id: string }>('admin-users', {
        body: { action: 'create', displayName: input.displayName, email: input.email, role: input.role },
      })
      if (error) throw await toUserActionError(error)
      return data!.id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
  })
}

/** Role change (Ruling R9): `profiles.role` is authoritative, so this writes it directly
 * rather than going through an edge function -- RLS already restricts the write to
 * callers with `users.manage`. */
export function useSetUserRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: Id; role: 'admin' | 'juror' }) => {
      const { error } = await supabase.from('profiles').update({ role }).eq('id', userId)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
  })
}

/** Activates/deactivates a user via `admin-users` (it also bans/unbans the auth user,
 * which only the service role can do). */
export function useSetUserActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, active }: { userId: Id; active: boolean }) => {
      const { error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'set_active', userId, active },
      })
      if (error) throw await toUserActionError(error)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
  })
}

/** Sets (or replaces) a user's email via `admin-users` -- the main way to turn a juror's
 * placeholder address into a real one. */
export function useSetUserEmail() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, email }: { userId: Id; email: string }) => {
      const { error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'set_email', userId, email },
      })
      if (error) throw await toUserActionError(error)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
  })
}

/** `${VITE_APP_URL}/j/${token}`, falling back to the current origin when the env var
 * isn't set (e.g. local dev without a `.env.local`). */
function buildJurorLinkUrl(token: string): string {
  const base = (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, '')
  return `${base || window.location.origin}/j/${token}`
}

/** Issues a fresh personal login link for one juror, revoking any previous one (the
 * edge function does the revoke). Bound to a specific juror at the hook call site, like
 * `useEventJurors(eventId)` -- the dialog that shows the link is always for one juror. */
export function useIssueJurorLink(jurorId: Id) {
  return useMutation({
    mutationFn: async (): Promise<{ url: string }> => {
      const { data, error } = await supabase.functions.invoke<{ token: string }>('juror-link', {
        body: { action: 'issue', jurorId },
      })
      if (error) throw error
      return { url: buildJurorLinkUrl(data!.token) }
    },
  })
}

/** Revokes a juror's current link without issuing a new one -- e.g. if it leaked and the
 * admin wants it dead immediately, before generating a replacement. */
export function useRevokeJurorLink() {
  return useMutation({
    mutationFn: async (jurorId: Id): Promise<void> => {
      const { error } = await supabase.functions.invoke('juror-link', {
        body: { action: 'revoke', jurorId },
      })
      if (error) throw error
    },
  })
}

export type UserFormValue = { displayName: string; email: string; role: 'admin' | 'juror' }

export const BLANK_USER_FORM: UserFormValue = { displayName: '', email: '', role: 'juror' }

export type UserFormErrorCode = 'displayNameRequired' | 'emailInvalid'
export type UserFormErrors = Partial<Record<'displayName' | 'email', UserFormErrorCode>>

export const USER_FORM_ERROR_KEYS: Record<UserFormErrorCode, ParseKeys> = {
  displayNameRequired: 'users.nameRequired',
  emailInvalid: 'users.emailInvalid',
}

export function userFieldErrorMessage(
  t: TFunction,
  code: UserFormErrorCode | undefined,
): string | undefined {
  return code ? t(USER_FORM_ERROR_KEYS[code]) : undefined
}

/** Validates the create-user form against `userInputSchema`. A blank email becomes
 * `undefined` (the schema's optional email), not an empty string that would fail
 * `z.email()`. */
export function validateUserForm(
  form: UserFormValue,
): { data: UserInput } | { errors: UserFormErrors } {
  const result = userInputSchema.safeParse({
    displayName: form.displayName,
    email: form.email.trim() || undefined,
    role: form.role,
  })
  if (result.success) return { data: result.data }

  const errors: UserFormErrors = {}
  for (const issue of result.error.issues) {
    const path = issue.path.join('.')
    if (path === 'displayName') errors.displayName ??= 'displayNameRequired'
    else if (path === 'email') errors.email ??= 'emailInvalid'
  }
  return { errors }
}

/** Validates a standalone "set email" form (used to replace a placeholder address). */
export function validateEmailForm(email: string): { data: string } | { error: UserFormErrorCode } {
  const result = userInputSchema.shape.email.unwrap().safeParse(email.trim())
  return result.success ? { data: result.data } : { error: 'emailInvalid' }
}
