import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { toTeam, useReorderTeams, useSetTiebreakOrder } from './api'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('toTeam', () => {
  it('maps the snake_case DB row (with its embedded project) to a camelCase TeamWithProject', () => {
    expect(
      toTeam({
        id: 't1',
        name: 'Team Vega',
        members: ['Ana', 'Bogdan'],
        pitch_order: 3,
        no_show: false,
        manual_tiebreak: null,
        projects: {
          id: 'p1',
          name: 'Project Atlas',
          description: 'A routing app.',
          theme_id: 'th1',
          repo_url: 'https://github.com/example/project-atlas',
        },
      }),
    ).toEqual({
      id: 't1',
      name: 'Team Vega',
      members: ['Ana', 'Bogdan'],
      pitchOrder: 3,
      noShow: false,
      manualTiebreak: null,
      project: {
        name: 'Project Atlas',
        description: 'A routing app.',
        themeId: 'th1',
        repoUrl: 'https://github.com/example/project-atlas',
      },
    })
  })

  it('fills the project with nulls when the team has no project row yet', () => {
    const team = toTeam({
      id: 't2',
      name: 'No Project Yet',
      members: [],
      pitch_order: 1,
      no_show: false,
      manual_tiebreak: null,
      projects: null,
    })
    expect(team.project).toEqual({ name: null, description: null, themeId: null, repoUrl: null })
  })
})

describe('useReorderTeams', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renumbers pitch order 1..n in the given order', async () => {
    const calls: { id: string; pitch_order: number }[] = []
    vi.mocked(supabase.from).mockImplementation(
      () =>
        ({
          update: (payload: { pitch_order: number }) => ({
            eq: (_col: string, id: string) => {
              calls.push({ id, pitch_order: payload.pitch_order })
              return Promise.resolve({ error: null })
            },
          }),
        }) as never,
    )

    const { result } = renderHook(() => useReorderTeams('ev-1'), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(['t3', 't1', 't2'])
    })

    expect(calls).toEqual([
      { id: 't3', pitch_order: 1 },
      { id: 't1', pitch_order: 2 },
      { id: 't2', pitch_order: 3 },
    ])
  })
})

describe('useSetTiebreakOrder', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('writes manual_tiebreak 1..k to every team in the given order, all at once', async () => {
    const calls: { id: string; manual_tiebreak: number }[] = []
    vi.mocked(supabase.from).mockImplementation(
      () =>
        ({
          update: (payload: { manual_tiebreak: number }) => ({
            eq: (_col: string, id: string) => {
              calls.push({ id, manual_tiebreak: payload.manual_tiebreak })
              return Promise.resolve({ error: null })
            },
          }),
        }) as never,
    )

    const { result } = renderHook(() => useSetTiebreakOrder('ev-1'), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(['b', 'a', 'c'])
    })

    expect(calls).toEqual([
      { id: 'b', manual_tiebreak: 1 },
      { id: 'a', manual_tiebreak: 2 },
      { id: 'c', manual_tiebreak: 3 },
    ])
  })
})
