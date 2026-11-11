import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { ParseKeys, TFunction } from 'i18next'
import { teamInputSchema, type TeamInput } from '@/domain/schemas'
import type { Id, Team } from '@/domain/types'
import { supabase } from '@/lib/supabase'

/** A team plus its one project (name/description/theme/repo link), the shape the Teams
 * page reads and writes. `project` fields are null until a project has been saved. */
export interface TeamWithProject extends Team {
  members: string[]
  project: {
    name: string | null
    description: string | null
    themeId: Id | null
    repoUrl: string | null
  }
}

/** What jurors' screens load: everything but `manual_tiebreak`, the organizer's private
 * tie-break decision, which no juror screen shows. */
const JUROR_TEAM_COLUMNS =
  'id, name, members, pitch_order, no_show, projects(id, name, description, theme_id, repo_url)'
/** What the organizer's screens load. */
const TEAM_COLUMNS = `${JUROR_TEAM_COLUMNS}, manual_tiebreak`

type ProjectDbRow = {
  id: string
  name: string | null
  description: string | null
  theme_id: string | null
  repo_url: string | null
} | null

type TeamDbRow = {
  id: string
  name: string
  members: string[]
  pitch_order: number | null
  no_show: boolean
  /** Absent when loaded with `JUROR_TEAM_COLUMNS`. */
  manual_tiebreak?: number | null
  projects: ProjectDbRow
}

/** Exported for its own unit test; also the only place that knows the DB's snake_case shape. */
export function toTeam(row: TeamDbRow): TeamWithProject {
  return {
    id: row.id,
    name: row.name,
    members: row.members,
    pitchOrder: row.pitch_order ?? 0,
    noShow: row.no_show,
    manualTiebreak: row.manual_tiebreak ?? null,
    project: {
      name: row.projects?.name ?? null,
      description: row.projects?.description ?? null,
      themeId: row.projects?.theme_id ?? null,
      repoUrl: row.projects?.repo_url ?? null,
    },
  }
}

async function fetchTeams(eventId: Id, columns: string): Promise<TeamWithProject[]> {
  const { data, error } = await supabase
    .from('teams')
    .select(columns)
    .eq('event_id', eventId)
    .order('pitch_order', { ascending: true })
  if (error) throw error
  return (data as unknown as TeamDbRow[]).map(toTeam)
}

/** An event's teams and their projects, in pitch order (organizer screens). */
export function useTeams(eventId: Id): UseQueryResult<TeamWithProject[]> {
  return useQuery({
    queryKey: ['teams', eventId],
    queryFn: () => fetchTeams(eventId, TEAM_COLUMNS),
    enabled: Boolean(eventId),
  })
}

/** The same, for jurors' screens: without the organizer-only manual tie-break
 * (`manualTiebreak` is always null). Its own cache entry under the `['teams', eventId]`
 * prefix, so every invalidation of an event's teams refreshes it too. */
export function useJurorTeams(eventId: Id): UseQueryResult<TeamWithProject[]> {
  return useQuery({
    queryKey: ['teams', eventId, 'juror'],
    queryFn: () => fetchTeams(eventId, JUROR_TEAM_COLUMNS),
    enabled: Boolean(eventId),
  })
}

/** Creates (no `id`) or updates a team, then upserts its project by `team_id`. The two
 * writes aren't atomic, but a project upsert failure after the team write still leaves
 * the team saved -- the organizer can retry and the project will be filled in then. */
export function useSaveTeam() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: TeamInput & { id?: Id; eventId: Id }): Promise<TeamWithProject> => {
      const teamPayload = {
        name: input.name,
        members: input.members,
        pitch_order: input.pitchOrder,
      }
      const { data: teamRow, error: teamError } = input.id
        ? await supabase.from('teams').update(teamPayload).eq('id', input.id).select('id').single()
        : await supabase
            .from('teams')
            .insert({ ...teamPayload, event_id: input.eventId })
            .select('id')
            .single()
      if (teamError) throw teamError
      const teamId = teamRow.id as Id

      const { error: projectError } = await supabase.from('projects').upsert(
        {
          team_id: teamId,
          name: input.project.name,
          description: input.project.description,
          theme_id: input.project.themeId,
          repo_url: input.project.repoUrl,
        },
        { onConflict: 'team_id' },
      )
      if (projectError) throw projectError

      const { data, error } = await supabase
        .from('teams')
        .select(TEAM_COLUMNS)
        .eq('id', teamId)
        .single()
      if (error) throw error
      return toTeam(data as unknown as TeamDbRow)
    },
    onSuccess: (_team, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['teams', variables.eventId] })
    },
  })
}

export function useDeleteTeam() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: Id; eventId: Id }) => {
      const { error } = await supabase.from('teams').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['teams', variables.eventId] })
    },
  })
}

/** Persists a drag-and-drop (or keyboard) reorder by writing each row's 1..n pitch order. */
export function useReorderTeams(eventId: Id) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (orderedIds: Id[]) => {
      for (const [index, id] of orderedIds.entries()) {
        const { error } = await supabase
          .from('teams')
          .update({ pitch_order: index + 1 })
          .eq('id', id)
        if (error) throw error
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['teams', eventId] })
    },
  })
}

/** Persists the organizer's manual order for a tied group, writing 1..k to every team in
 * `orderedIds` at once -- never one team at a time -- so a partial state (only some of the
 * tied teams given an order) can't arise from this UI (see `rankTeams`' comparator, which
 * sorts a team with no manual order after one that has it within the same tie). */
export function useSetTiebreakOrder(eventId: Id) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (orderedIds: Id[]) => {
      for (const [index, id] of orderedIds.entries()) {
        const { error } = await supabase
          .from('teams')
          .update({ manual_tiebreak: index + 1 })
          .eq('id', id)
        if (error) throw error
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['teams', eventId] })
    },
  })
}

/** Toggles a team's no-show flag. Invalidates every event's teams list (no `eventId` is
 * threaded through the call site) rather than one specific key. */
export function useSetNoShow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ teamId, noShow }: { teamId: Id; noShow: boolean }) => {
      const { error } = await supabase.from('teams').update({ no_show: noShow }).eq('id', teamId)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['teams'] })
    },
  })
}

export type TeamFormValue = {
  name: string
  members: string[]
  projectName: string
  projectDescription: string
  themeId: string
  repoUrl: string
}

export const BLANK_TEAM_FORM: TeamFormValue = {
  name: '',
  members: [],
  projectName: '',
  projectDescription: '',
  themeId: '',
  repoUrl: '',
}

export function toTeamFormValue(team: TeamWithProject): TeamFormValue {
  return {
    name: team.name,
    members: team.members,
    projectName: team.project.name ?? '',
    projectDescription: team.project.description ?? '',
    themeId: team.project.themeId ?? '',
    repoUrl: team.project.repoUrl ?? '',
  }
}

export type TeamFormErrorCode = 'nameRequired' | 'repoUrlInvalid' | 'descriptionTooLong'
export type TeamFormErrors = Partial<Record<'name' | 'repoUrl' | 'description', TeamFormErrorCode>>

export const TEAM_FORM_ERROR_KEYS: Record<TeamFormErrorCode, ParseKeys> = {
  nameRequired: 'teams.nameRequired',
  repoUrlInvalid: 'teams.repoUrlInvalid',
  descriptionTooLong: 'teams.descriptionTooLong',
}

export function teamFieldErrorMessage(
  t: TFunction,
  code: TeamFormErrorCode | undefined,
): string | undefined {
  return code ? t(TEAM_FORM_ERROR_KEYS[code]) : undefined
}

/** Validates a team form against `teamInputSchema`, mapping zod issues to field-level
 * error codes. Blank optional project fields become `null`, matching the schema and the
 * `TeamWithProject.project` shape (never empty strings). */
export function validateTeamForm(
  form: TeamFormValue,
  pitchOrder: number,
): { data: TeamInput } | { errors: TeamFormErrors } {
  const result = teamInputSchema.safeParse({
    name: form.name,
    members: form.members,
    pitchOrder,
    project: {
      name: form.projectName.trim() || null,
      description: form.projectDescription.trim() || null,
      themeId: form.themeId || null,
      repoUrl: form.repoUrl.trim() || null,
    },
  })
  if (result.success) return { data: result.data }

  const errors: TeamFormErrors = {}
  for (const issue of result.error.issues) {
    const path = issue.path.join('.')
    if (path === 'name') errors.name ??= 'nameRequired'
    else if (path === 'project.repoUrl') errors.repoUrl ??= 'repoUrlInvalid'
    else if (path === 'project.description') errors.description ??= 'descriptionTooLong'
  }
  return { errors }
}
