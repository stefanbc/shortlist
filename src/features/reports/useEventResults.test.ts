import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Criterion } from '@/domain/types'
import { supabase } from '@/lib/supabase'
import {
  toLateAttemptGroups,
  toScoreRow,
  useEventResults,
  useEventScores,
  useLateAttempts,
} from './useEventResults'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() },
}))

function mockChannel() {
  let handler: (() => void) | null = null
  const channel = {
    on: vi.fn((_event: string, _filter: unknown, callback: () => void) => {
      handler = callback
      return channel
    }),
    subscribe: vi.fn(() => channel),
  }
  vi.mocked(supabase.channel).mockReturnValue(channel as never)
  return { channel, trigger: () => handler?.() }
}

const TEAM1 = {
  id: 't1',
  name: 'Team One',
  members: [],
  pitch_order: 1,
  no_show: false,
  manual_tiebreak: null,
  projects: null,
}
const TEAM2 = {
  id: 't2',
  name: 'Team Two',
  members: [],
  pitch_order: 2,
  no_show: false,
  manual_tiebreak: null,
  projects: null,
}

const CRITERION_A = { id: 'c1', name: 'A', weight: 10, position: 1 }
const CRITERION_B = { id: 'c2', name: 'B', weight: 10, position: 2 }

const JUROR1 = { id: 'j1', display_name: 'Ana', email: null, role: 'juror', active: true }

const SCORE_ROWS = [
  // t1 scores high on A, low on B; t2 the opposite -- weight changes should flip the order.
  { team_id: 't1', criterion_id: 'c1', juror_id: 'j1', value: 5, updated_at: '2026-01-01T00:00:00Z' },
  { team_id: 't1', criterion_id: 'c2', juror_id: 'j1', value: 1, updated_at: '2026-01-01T00:00:00Z' },
  { team_id: 't2', criterion_id: 'c1', juror_id: 'j1', value: 1, updated_at: '2026-01-01T00:00:00Z' },
  { team_id: 't2', criterion_id: 'c2', juror_id: 'j1', value: 5, updated_at: '2026-01-01T00:00:00Z' },
]

/** A minimal stand-in for `.select().eq().order()` / `.select().eq()` chains, resolving to
 * `{ data, error: null }` regardless of how many `.eq()`/`.order()` calls follow `.select()`. */
function chain(rows: unknown[]) {
  const node = {
    select: () => node,
    eq: () => node,
    order: () => node,
    range: () => Promise.resolve({ data: rows, error: null }),
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve),
  }
  return node
}

function mockTables() {
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'teams') return chain([TEAM1, TEAM2]) as never
    if (table === 'criteria') return chain([CRITERION_A, CRITERION_B]) as never
    if (table === 'event_jurors') return chain([{ profiles: JUROR1 }]) as never
    if (table === 'scores') return chain(SCORE_ROWS) as never
    throw new Error(`unexpected table: ${table}`)
  })
}

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('toScoreRow', () => {
  it('maps the snake_case DB row to camelCase, keeping updatedAt', () => {
    expect(
      toScoreRow({
        team_id: 't1',
        criterion_id: 'c1',
        juror_id: 'j1',
        value: 4.5,
        updated_at: '2026-01-01T00:00:00Z',
      }),
    ).toEqual({
      teamId: 't1',
      criterionId: 'c1',
      jurorId: 'j1',
      value: 4.5,
      updatedAt: '2026-01-01T00:00:00Z',
    })
  })
})

describe('toLateAttemptGroups', () => {
  it('groups rows by juror + team and counts them', () => {
    expect(
      toLateAttemptGroups([
        { juror_id: 'j1', team_id: 't1' },
        { juror_id: 'j1', team_id: 't1' },
        { juror_id: 'j2', team_id: 't1' },
      ]),
    ).toEqual(
      expect.arrayContaining([
        { jurorId: 'j1', teamId: 't1', count: 2 },
        { jurorId: 'j2', teamId: 't1', count: 1 },
      ]),
    )
  })
})

describe('useEventScores', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('subscribes to a unique topic and invalidates on any scores change, debounced', async () => {
    vi.useFakeTimers()
    const { channel, trigger } = mockChannel()
    vi.mocked(supabase.from).mockReturnValue(chain(SCORE_ROWS) as never)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    renderHook(() => useEventScores('ev-1'), { wrapper: wrapper(queryClient) })

    expect(channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'scores', filter: 'event_id=eq.ev-1' },
      expect.any(Function),
    )

    // A burst of changes collapses into a single debounced invalidate.
    trigger()
    trigger()
    trigger()
    expect(invalidate).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['scores', 'event', 'ev-1'] })
    vi.useRealTimers()
  })

  it('orders deterministically before paging, and returns every row exactly once across pages', async () => {
    mockChannel()
    const page1 = Array.from({ length: 1000 }, (_, i) => ({
      team_id: `t${i}`,
      criterion_id: 'c1',
      juror_id: 'j1',
      value: 3,
      updated_at: '2026-01-01T00:00:00Z',
    }))
    const page2 = [
      { team_id: 'tLast', criterion_id: 'c1', juror_id: 'j1', value: 3, updated_at: '2026-01-01T00:00:00Z' },
    ]
    let call = 0
    const order = vi.fn(() => node)
    const range = vi.fn(() => Promise.resolve({ data: call++ === 0 ? page1 : page2, error: null }))
    const node = { select: () => node, eq: () => node, order, range }
    vi.mocked(supabase.from).mockImplementation(() => node as never)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { result } = renderHook(() => useEventScores('ev-1'), { wrapper: wrapper(queryClient) })

    await waitFor(() => expect(result.current.data).toHaveLength(1001))

    // Every row appears exactly once -- no gap or overlap between the two pages.
    const teamIds = result.current.data!.map((row) => row.teamId)
    expect(new Set(teamIds).size).toBe(1001)

    // .order() must run before each .range() call, not just be called at some point --
    // otherwise Postgres has no fixed row order and pages can overlap or skip rows.
    expect(order).toHaveBeenCalled()
    expect(range).toHaveBeenCalledTimes(2)
    for (let i = 0; i < range.mock.invocationCallOrder.length; i++) {
      expect(order.mock.invocationCallOrder[i]).toBeLessThan(range.mock.invocationCallOrder[i])
    }
  })
})

describe('useLateAttempts', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('groups late attempts by juror and team', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      chain([
        { juror_id: 'j1', team_id: 't1' },
        { juror_id: 'j1', team_id: 't1' },
      ]) as never,
    )
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { result } = renderHook(() => useLateAttempts('ev-1'), { wrapper: wrapper(queryClient) })

    await waitFor(() => expect(result.current.data).toEqual([{ jurorId: 'j1', teamId: 't1', count: 2 }]))
  })
})

describe('useEventResults', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('recomputes the ranking when a criterion weight changes', async () => {
    mockChannel()
    mockTables()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { result } = renderHook(() => useEventResults('ev-1'), { wrapper: wrapper(queryClient) })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Equal weights: t1 (5+1)/2=3, t2 (1+5)/2=3 -- tied, so order isn't decided by final alone.
    const firstFinals = result.current.ranked.map((r) => r.final)
    expect(firstFinals[0]).toBeCloseTo(firstFinals[1] as number, 9)

    act(() => {
      queryClient.setQueryData(
        ['criteria', 'ev-1'],
        [
          { ...CRITERION_A, weight: 100 },
          { ...CRITERION_B, weight: 1 },
        ] satisfies Criterion[],
      )
    })

    await waitFor(() => expect(result.current.ranked[0].teamId).toBe('t1'))
    expect(result.current.ranked[0].final).toBeGreaterThan(result.current.ranked[1].final as number)
  })
})
