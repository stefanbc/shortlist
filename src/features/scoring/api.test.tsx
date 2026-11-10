import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventRow } from '@/features/events/api'
import { ScoreRejectedError, useScoreQueue, type QueuedScore } from '@/stores/scoreQueue'
import { myScoresKey, sendScore, useMyScores, useScoreSync } from './api'

const { mockRpc, mockFrom, mockUseEvent } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
  mockUseEvent: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mockRpc, from: mockFrom } }))
vi.mock('@/features/events/api', () => ({ useEvent: mockUseEvent }))

type RpcResponse = {
  data: unknown
  error: { message: string; code: string } | null
  status: number
}

/** Stand-in for `supabase.rpc(...)`: chainable `.abortSignal()` resolving to the response. */
function rpcReturns(...responses: RpcResponse[]) {
  for (const response of responses) {
    mockRpc.mockReturnValueOnce({ abortSignal: () => Promise.resolve(response) })
  }
}
const ok = (data: string): RpcResponse => ({ data, error: null, status: 200 })
const offline: RpcResponse = {
  data: null,
  error: { message: 'TypeError: Failed to fetch', code: '' },
  status: 0,
}

/** Stand-in for `supabase.from('scores').select(...).eq('event_id', id)`. */
function scoresReturn(rows: { team_id: string; criterion_id: string; value: number }[]) {
  mockFrom.mockReturnValue({
    select: () => ({ eq: () => Promise.resolve({ data: rows, error: null }) }),
  })
}

const queued = (overrides: Partial<QueuedScore> = {}): QueuedScore => ({
  key: 'team-1:crit-1',
  eventId: 'ev-1',
  teamId: 'team-1',
  criterionId: 'crit-1',
  value: 3,
  tappedAt: '2026-11-10T10:00:00.000Z',
  status: 'pending',
  ...overrides,
})

const event = (overrides: Partial<EventRow> = {}): EventRow => ({
  id: 'ev-1',
  name: 'Astra Hack',
  startsAt: '2026-11-10T09:00:00.000Z',
  endsAt: '2026-11-10T18:00:00.000Z',
  statusOverride: 'auto',
  lockedAt: null,
  pitchMinutes: 7,
  nowPitchingTeamId: null,
  nowPitchingSince: null,
  ...overrides,
})

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { queryClient, wrapper }
}

const items = () => useScoreQueue.getState().items

beforeEach(() => {
  localStorage.clear()
  useScoreQueue.setState({ items: {} })
  mockRpc.mockReset()
  mockFrom.mockReset()
  mockUseEvent.mockReset()
  mockUseEvent.mockReturnValue({ data: event() })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('sendScore', () => {
  it('calls upsert_score with the queued cell, passing null through to clear it', async () => {
    rpcReturns(ok('saved'))
    await expect(sendScore(queued({ value: null }))).resolves.toBe('saved')
    expect(mockRpc).toHaveBeenCalledWith('upsert_score', {
      p_team: 'team-1',
      p_criterion: 'crit-1',
      p_value: null,
      p_tapped_at: '2026-11-10T10:00:00.000Z',
    })
  })

  it.each(['not_open', 'locked', 'not_assigned'])(
    'returns the server verdict %s',
    async (verdict) => {
      rpcReturns(ok(verdict))
      await expect(sendScore(queued())).resolves.toBe(verdict)
    },
  )

  it.each([
    ['offline', offline],
    ['a 503', { data: null, error: { message: 'unavailable', code: '' }, status: 503 }],
    [
      'an expired session',
      { data: null, error: { message: 'JWT expired', code: 'PGRST301' }, status: 401 },
    ],
  ])('throws a transient (non-rejection) error when %s', async (_label, response) => {
    rpcReturns(response)
    const error = await sendScore(queued()).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(ScoreRejectedError)
  })

  it('throws ScoreRejectedError when the server refuses the call (client bug)', async () => {
    rpcReturns({
      data: null,
      error: { message: 'criterion does not belong', code: '22023' },
      status: 400,
    })
    await expect(sendScore(queued())).rejects.toBeInstanceOf(ScoreRejectedError)
  })

  it('throws ScoreRejectedError on an unknown verdict', async () => {
    rpcReturns(ok('maybe'))
    await expect(sendScore(queued())).rejects.toBeInstanceOf(ScoreRejectedError)
  })
})

describe('useMyScores', () => {
  it('overlays queued taps on server scores: queue wins, null removes, other events ignored', async () => {
    scoresReturn([
      { team_id: 'team-1', criterion_id: 'crit-1', value: 2 },
      { team_id: 'team-1', criterion_id: 'crit-2', value: 4 },
      { team_id: 'team-2', criterion_id: 'crit-1', value: 5 },
    ])
    useScoreQueue.setState({
      items: {
        'team-1:crit-1': queued({ value: 3.5 }),
        'team-1:crit-2': queued({ key: 'team-1:crit-2', criterionId: 'crit-2', value: null }),
        'team-3:crit-1': queued({
          key: 'team-3:crit-1',
          teamId: 'team-3',
          status: 'rejected',
          reason: 'locked',
        }),
        'team-9:crit-1': queued({ key: 'team-9:crit-1', eventId: 'ev-2', teamId: 'team-9' }),
      },
    })
    const { wrapper } = setup()

    const { result } = renderHook(() => useMyScores('ev-1'), { wrapper })

    await waitFor(() =>
      expect(result.current).toEqual({
        'team-1:crit-1': 3.5,
        'team-2:crit-1': 5,
        'team-3:crit-1': 3,
      }),
    )
    expect(mockFrom).toHaveBeenCalledWith('scores')
  })

  it('shows queued taps before the server answers', () => {
    mockFrom.mockReturnValue({ select: () => ({ eq: () => new Promise(() => {}) }) })
    useScoreQueue.setState({ items: { 'team-1:crit-1': queued({ value: 4 }) } })
    const { wrapper } = setup()

    const { result } = renderHook(() => useMyScores('ev-1'), { wrapper })

    expect(result.current).toEqual({ 'team-1:crit-1': 4 })
  })
})

describe('useScoreSync', () => {
  it('flushes after enqueue and invalidates my scores once saved', async () => {
    rpcReturns(ok('saved'))
    const { queryClient, wrapper } = setup()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useScoreSync('ev-1'), { wrapper })

    act(() =>
      useScoreQueue
        .getState()
        .enqueue({ eventId: 'ev-1', teamId: 'team-1', criterionId: 'crit-1', value: 3 }),
    )

    await waitFor(() => expect(items()).toEqual({}))
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: myScoresKey('ev-1') })
    expect(result.current.pending).toBe(0)
  })

  it('writes a saved value into the cached scores so the cell does not flicker back', async () => {
    rpcReturns(ok('saved'))
    const { queryClient, wrapper } = setup()
    queryClient.setQueryData(myScoresKey('ev-1'), { 'team-1:crit-1': 2 })
    renderHook(() => useScoreSync('ev-1'), { wrapper })

    act(() =>
      useScoreQueue
        .getState()
        .enqueue({ eventId: 'ev-1', teamId: 'team-1', criterionId: 'crit-1', value: 3 }),
    )

    await waitFor(() => expect(items()).toEqual({}))
    expect(queryClient.getQueryData(myScoresKey('ev-1'))).toEqual({ 'team-1:crit-1': 3 })
  })

  it('keeps the tap while offline and sends it when the browser comes back online', async () => {
    rpcReturns(offline, ok('saved'))
    const { wrapper } = setup()
    const { result } = renderHook(() => useScoreSync('ev-1'), { wrapper })

    act(() =>
      useScoreQueue
        .getState()
        .enqueue({ eventId: 'ev-1', teamId: 'team-1', criterionId: 'crit-1', value: 3 }),
    )
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1))
    expect(result.current.pending).toBe(1)

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current.online).toBe(false)

    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    await waitFor(() => expect(result.current.pending).toBe(0))
    expect(result.current.online).toBe(true)
    expect(mockRpc).toHaveBeenCalledTimes(2)
  })

  it('flushes when the page becomes visible again', async () => {
    useScoreQueue.setState({ items: { 'team-1:crit-1': queued() } })
    rpcReturns(offline, ok('saved'))
    const { wrapper } = setup()
    renderHook(() => useScoreSync('ev-1'), { wrapper })
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1))

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => expect(items()).toEqual({}))
    expect(mockRpc).toHaveBeenCalledTimes(2)
  })

  it('retries every 10 s', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(new Date('2026-11-10T10:00:00.000Z'))
    useScoreQueue.setState({ items: { 'team-1:crit-1': queued() } })
    rpcReturns(offline, ok('saved'))
    const { wrapper } = setup()
    renderHook(() => useScoreSync('ev-1'), { wrapper })
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_999)
    })
    expect(mockRpc).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    await waitFor(() => expect(items()).toEqual({}))
    expect(mockRpc).toHaveBeenCalledTimes(2)
  })

  it('counts pending and rejected for this event only', () => {
    useScoreQueue.setState({
      items: {
        a: queued({ key: 'a', status: 'rejected', reason: 'locked' }),
        b: queued({ key: 'b', status: 'rejected', reason: 'not_assigned' }),
        c: queued({ key: 'c', eventId: 'ev-2', status: 'rejected', reason: 'locked' }),
      },
    })
    mockUseEvent.mockReturnValue({ data: event({ statusOverride: 'locked' }) })
    const { wrapper } = setup()

    const { result } = renderHook(() => useScoreSync('ev-1'), { wrapper })

    expect(result.current).toMatchObject({ pending: 0, rejected: 2 })
  })

  it('retries rejected taps when the event becomes open by time', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(new Date('2026-11-10T08:59:55.000Z')) // 5 s before starts_at
    useScoreQueue.setState({
      items: { 'team-1:crit-1': queued({ status: 'rejected', reason: 'not_open' }) },
    })
    rpcReturns(ok('saved'))
    const { wrapper } = setup()
    const { result } = renderHook(() => useScoreSync('ev-1'), { wrapper })
    expect(result.current.rejected).toBe(1)
    expect(mockRpc).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })

    await waitFor(() => expect(items()).toEqual({}))
    expect(mockRpc).toHaveBeenCalledTimes(1)
  })

  it('retries rejected taps when an admin reopens the event', async () => {
    useScoreQueue.setState({
      items: { 'team-1:crit-1': queued({ status: 'rejected', reason: 'locked' }) },
    })
    mockUseEvent.mockReturnValue({ data: event({ statusOverride: 'locked' }) })
    rpcReturns(ok('saved'))
    const { wrapper } = setup()
    const { rerender } = renderHook(() => useScoreSync('ev-1'), { wrapper })
    expect(mockRpc).not.toHaveBeenCalled()

    mockUseEvent.mockReturnValue({ data: event({ statusOverride: 'open' }) })
    rerender()

    await waitFor(() => expect(items()).toEqual({}))
  })
})
