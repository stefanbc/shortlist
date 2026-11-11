import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { Id } from '@/domain/types'
import { supabase } from '@/lib/supabase'

/**
 * The event's stagetimer.io viewer link (see migration 0007). Kept apart from the main
 * event queries on purpose: only the organizer's dashboard and settings need it, and a
 * failure here (say, the column not migrated yet) must not take the event itself down.
 */

export type StagetimerUrlError = 'notStagetimer' | 'controllerLink'

/** Cleans up what the organizer pasted. '' means "no timer". Only https links on
 * stagetimer.io pass, and never a controller link: jurors can read the event row, and
 * the controller link lets anyone holding it run the timer. */
export function parseStagetimerUrl(
  input: string,
): { ok: true; url: string | null } | { ok: false; error: StagetimerUrlError } {
  const text = input.trim()
  if (text === '') return { ok: true, url: null }
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return { ok: false, error: 'notStagetimer' }
  }
  const host = url.hostname.toLowerCase()
  if (host !== 'stagetimer.io' && !host.endsWith('.stagetimer.io')) {
    return { ok: false, error: 'notStagetimer' }
  }
  if (/controller/i.test(url.pathname + url.search)) return { ok: false, error: 'controllerLink' }
  url.protocol = 'https:'
  url.hash = ''
  const clean = url.toString()
  if (clean.length > 500) return { ok: false, error: 'notStagetimer' }
  return { ok: true, url: clean }
}

export function useStagetimerUrl(eventId: Id): UseQueryResult<string | null> {
  return useQuery({
    queryKey: ['events', 'stagetimer', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('stagetimer_url')
        .eq('id', eventId)
        .maybeSingle()
      if (error) throw error
      return data?.stagetimer_url ?? null
    },
    enabled: Boolean(eventId),
    retry: false,
  })
}

export function useSaveStagetimerUrl(eventId: Id) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (url: string | null): Promise<string | null> => {
      const { error } = await supabase.from('events').update({ stagetimer_url: url }).eq('id', eventId)
      if (error) throw error
      return url
    },
    onSuccess: (url) => {
      queryClient.setQueryData(['events', 'stagetimer', eventId], url)
    },
  })
}
