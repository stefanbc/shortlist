import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { CriterionInput, ThemeInput } from '@/domain/schemas'
import type { Criterion, Id } from '@/domain/types'
import { supabase } from '@/lib/supabase'

export interface Theme {
  id: Id
  name: string
  position: number
}

const CRITERIA_COLUMNS = 'id, name, weight, position'
const THEME_COLUMNS = 'id, name, position'

type CriterionDbRow = { id: string; name: string; weight: number; position: number }
type ThemeDbRow = { id: string; name: string; position: number }

/** Exported for its own unit test; also the only place that knows the DB's snake_case shape. */
export function toCriterion(row: CriterionDbRow): Criterion {
  return { id: row.id, name: row.name, weight: row.weight, position: row.position }
}

export function toTheme(row: ThemeDbRow): Theme {
  return { id: row.id, name: row.name, position: row.position }
}

/** An event's criteria, ordered for display and reordering. */
export function useCriteria(eventId: Id): UseQueryResult<Criterion[]> {
  return useQuery({
    queryKey: ['criteria', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('criteria')
        .select(CRITERIA_COLUMNS)
        .eq('event_id', eventId)
        .order('position', { ascending: true })
      if (error) throw error
      return data.map(toCriterion)
    },
    enabled: Boolean(eventId),
  })
}

/** Creates (no `id`) or updates a criterion. The DB audit-logs weight changes itself; the
 * caller is only responsible for confirming with the organizer first when scoring has started. */
export function useSaveCriterion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CriterionInput & { id?: Id; eventId: Id }): Promise<Criterion> => {
      const payload = { name: input.name, weight: input.weight, position: input.position }
      const { data, error } = input.id
        ? await supabase
            .from('criteria')
            .update(payload)
            .eq('id', input.id)
            .select(CRITERIA_COLUMNS)
            .single()
        : await supabase
            .from('criteria')
            .insert({ ...payload, event_id: input.eventId })
            .select(CRITERIA_COLUMNS)
            .single()
      if (error) throw error
      return toCriterion(data)
    },
    onSuccess: (_criterion, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['criteria', variables.eventId] })
    },
  })
}

export function useDeleteCriterion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: Id; eventId: Id }) => {
      const { error } = await supabase.from('criteria').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['criteria', variables.eventId] })
    },
  })
}

/** Persists a drag-and-drop (or keyboard) reorder by writing each row's 1..n position. */
export function useReorderCriteria(eventId: Id) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (orderedIds: Id[]) => {
      for (const [index, id] of orderedIds.entries()) {
        const { error } = await supabase
          .from('criteria')
          .update({ position: index + 1 })
          .eq('id', id)
        if (error) throw error
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['criteria', eventId] })
    },
  })
}

/** An event's themes, ordered for display and reordering. */
export function useThemes(eventId: Id): UseQueryResult<Theme[]> {
  return useQuery({
    queryKey: ['themes', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('themes')
        .select(THEME_COLUMNS)
        .eq('event_id', eventId)
        .order('position', { ascending: true })
      if (error) throw error
      return data.map(toTheme)
    },
    enabled: Boolean(eventId),
  })
}

/** Creates (no `id`) or renames a theme. Themes carry only a name (Ruling R6) — no weight,
 * so unlike criteria, saving one never needs the recalculation confirmation. */
export function useSaveTheme() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (
      // `position` isn't part of ThemeInput (theme input is name-only, Ruling R6) but is
      // required to place a new theme at the end of the list; renames never pass it.
      input: ThemeInput & { id?: Id; eventId: Id; position?: number },
    ): Promise<Theme> => {
      const { data, error } = input.id
        ? await supabase
            .from('themes')
            .update({ name: input.name })
            .eq('id', input.id)
            .select(THEME_COLUMNS)
            .single()
        : await supabase
            .from('themes')
            .insert({ name: input.name, position: input.position ?? 0, event_id: input.eventId })
            .select(THEME_COLUMNS)
            .single()
      if (error) throw error
      return toTheme(data)
    },
    onSuccess: (_theme, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['themes', variables.eventId] })
    },
  })
}

export function useDeleteTheme() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: Id; eventId: Id }) => {
      const { error } = await supabase.from('themes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['themes', variables.eventId] })
    },
  })
}

export function useReorderThemes(eventId: Id) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (orderedIds: Id[]) => {
      for (const [index, id] of orderedIds.entries()) {
        const { error } = await supabase
          .from('themes')
          .update({ position: index + 1 })
          .eq('id', id)
        if (error) throw error
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['themes', eventId] })
    },
  })
}

/** Share of the event's total weight this criterion carries, rounded to a whole percent
 * (e.g. weight 90 of a 530 total -> 17). 0 when there's no weight to share yet. */
export function shareOfTotal(weight: number, totalWeight: number): number {
  return totalWeight > 0 ? Math.round((weight / totalWeight) * 100) : 0
}
