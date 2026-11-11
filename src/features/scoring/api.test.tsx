import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventRow } from '@/features/events/api'
import { ScoreRejectedError, queueId, useScoreQueue, type QueuedScore } from '@/stores/scoreQueue'
import { useSession } from '@/stores/session'
import {
  NOTE_SAVE_DELAY_MS,
  myNoteKey,
  myScoresKey,
  sendScore,
  timeoutSignal,
  useMyCellSync,
  useMyNote,
  useMyScores,
  useSaveNote,
  useScoreSync,
} from './api'

const { mockRpc, mockFrom, mockUseEvent, authSession } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
  mockUseEvent: vi.fn(),
  /** The user the Supabase client would send requests as. */
  authSession: { userId: null as string | null },
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: mockRpc,
    from: mockFrom,
    // The session store subscribes at import time.
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getSession: () =>
        Promise.resolve({
          data: { session: authSession.userId ? { user: { id: authSession.userId } } : null },
          error: null,
        }),
    },
  },
}))
vi.mock('@/features/events/api', () => ({ useEvent: mockUseEvent }))

const A = 'juror-a'
const B = 'juror-b'

/** Signs `jurorId` in everywhere: the Supabase auth session and the profile store. */
function signIn(jurorId: string) {
  authSession.userId = jurorId
  useSession.setState({
    status: 'signedIn',
    profile: { id: jurorId, displayName: jurorId, email: null, role: 'juror', active: true },
  })
}

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
  jurorId: A,
  eventId: 'ev-1',
  teamId: 'team-1',
  criterionId: 'crit-1',
  value: 3,
  tappedAt: '2026-11-10T10:00:00.000Z',
  status: 'pending',
  ...overrides,
})

/** Puts exactly these items in the queue, under the ids the store itself uses. */
const seed = (...items: QueuedScore[]) =>
  useScoreQueue.setState({ items: Object.fromEntries(items.map((q) => [queueId(q), q])) })

const tap = (jurorId = A, value = 3) =>
  act(() =>
    useScoreQueue
      .getState()
      .enqueue({ jurorId, eventId: 'ev-1', teamId: 'team-1', criterionId: 'crit-1', value }),
  )

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

/** Lets pending promise chains (getSession → rpc → store update) run, without touching timers. */
const settle = () =>
  act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve()
  })

beforeEach(() => {
  localStorage.clear()
  useScoreQueue.setState({ items: {} })
  signIn(A)
  mockRpc.mockReset()
  mockFrom.mockReset()
  mockUseEvent.mockReset()
  mockUseEvent.mockReturnValue({ data: event() })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
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
      p_juror: A,
    })
  })

  it("returns wrong_juror when the server says the tap is not the caller's", async () => {
    rpcReturns(ok('wrong_juror'))
    await expect(sendScore(queued())).resolves.toBe('wrong_juror')
  })

  it('sends nothing and answers wrong_juror when the auth session is another juror', async () => {
    authSession.userId = B // auth already switched; the profile store may still say A
    await expect(sendScore(queued({ jurorId: A }))).resolves.toBe('wrong_juror')
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('sends nothing and answers wrong_juror with no auth session', async () => {
    authSession.userId = null
    await expect(sendScore(queued())).resolves.toBe('wrong_juror')
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('clears the fallback timeout once the request finishes', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'AbortSignal',
      Object.assign(function AbortSignal() {}, {
        timeout: undefined,
      }) as unknown as typeof AbortSignal,
    )
    rpcReturns(ok('saved'))

    await sendScore(queued())

    expect(vi.getTimerCount()).toBe(0)
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
    [
      'a 403 (auth-level, never item-specific)',
      { data: null, error: { message: 'permission denied', code: '42501' }, status: 403 },
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

describe('timeoutSignal', () => {
  it('falls back to a timer when AbortSignal.timeout is unavailable (older Safari)', () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'AbortSignal',
      Object.assign(function AbortSignal() {}, {
        timeout: undefined,
      }) as unknown as typeof AbortSignal,
    )

    const { signal } = timeoutSignal(15_000)
    expect(signal.aborted).toBe(false)

    vi.advanceTimersByTime(15_000)
    expect(signal.aborted).toBe(true)
  })

  it('clear() cancels the fallback timer', () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'AbortSignal',
      Object.assign(function AbortSignal() {}, {
        timeout: undefined,
      }) as unknown as typeof AbortSignal,
    )

    const { signal, clear } = timeoutSignal(15_000)
    clear()
    vi.advanceTimersByTime(15_000)

    expect(signal.aborted).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('useMyScores', () => {
  it('overlays queued taps on server scores: queue wins, null removes, other events ignored', async () => {
    scoresReturn([
      { team_id: 'team-1', criterion_id: 'crit-1', value: 2 },
      { team_id: 'team-1', criterion_id: 'crit-2', value: 4 },
      { team_id: 'team-2', criterion_id: 'crit-1', value: 5 },
    ])
    seed(
      queued({ value: 3.5 }),
      queued({ key: 'team-1:crit-2', criterionId: 'crit-2', value: null }),
      queued({ key: 'team-3:crit-1', teamId: 'team-3', status: 'rejected', reason: 'locked' }),
      queued({ key: 'team-9:crit-1', eventId: 'ev-2', teamId: 'team-9' }),
    )
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
    seed(queued({ value: 4 }))
    const { wrapper } = setup()

    const { result } = renderHook(() => useMyScores('ev-1'), { wrapper })

    expect(result.current).toEqual({ 'team-1:crit-1': 4 })
  })

  it("does not show another juror's queued taps", () => {
    mockFrom.mockReturnValue({ select: () => ({ eq: () => new Promise(() => {}) }) })
    seed(queued({ jurorId: A, value: 4 }))
    signIn(B)
    const { wrapper } = setup()

    const { result } = renderHook(() => useMyScores('ev-1'), { wrapper })

    expect(result.current).toEqual({})
  })
})

// Tests that fake setInterval poll with vi.waitFor (real timers): RTL's waitFor polls via
// setInterval and would never re-check.
describe('useScoreSync', () => {
  it('flushes after enqueue and invalidates my scores once saved', async () => {
    rpcReturns(ok('saved'))
    const { queryClient, wrapper } = setup()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useScoreSync('ev-1'), { wrapper })

    tap()

    await waitFor(() => expect(items()).toEqual({}))
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: myScoresKey('ev-1') })
    expect(result.current.pending).toBe(0)
  })

  it('invalidates my scores for every event it saved, not only the current one', async () => {
    seed(queued({ key: 'team-9:crit-1', eventId: 'ev-2', teamId: 'team-9' }))
    rpcReturns(ok('saved'))
    const { queryClient, wrapper } = setup()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    renderHook(() => useScoreSync('ev-1'), { wrapper })

    await waitFor(() => expect(items()).toEqual({}))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: myScoresKey('ev-2') })
  })

  it('writes a saved value into the cached scores so the cell does not flicker back', async () => {
    rpcReturns(ok('saved'))
    const { queryClient, wrapper } = setup()
    queryClient.setQueryData(myScoresKey('ev-1', A), { 'team-1:crit-1': 2 })
    renderHook(() => useScoreSync('ev-1'), { wrapper })

    tap()

    await waitFor(() => expect(items()).toEqual({}))
    expect(queryClient.getQueryData(myScoresKey('ev-1', A))).toEqual({ 'team-1:crit-1': 3 })
  })

  it("never sends another juror's taps, keeps them, and sends them once that juror is back", async () => {
    seed(queued({ jurorId: A }))
    signIn(B)
    rpcReturns(ok('saved'))
    const { wrapper } = setup()
    const { rerender, result } = renderHook(() => useScoreSync('ev-1'), { wrapper })

    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    expect(mockRpc).not.toHaveBeenCalled()
    expect(result.current.pending).toBe(0)
    expect(Object.values(items())).toEqual([expect.objectContaining({ jurorId: A })])

    act(() => signIn(A))
    rerender()

    await waitFor(() => expect(items()).toEqual({}))
    expect(mockRpc).toHaveBeenCalledTimes(1)
  })

  it('stops a flush in progress when the auth session switches to another juror (profile store lagging)', async () => {
    seed(queued(), queued({ key: 'team-1:crit-2', criterionId: 'crit-2' }))
    let release!: (r: RpcResponse) => void
    mockRpc.mockReturnValueOnce({
      abortSignal: () => new Promise<RpcResponse>((resolve) => (release = resolve)),
    })
    rpcReturns(ok('saved'))
    const { wrapper } = setup()
    renderHook(() => useScoreSync('ev-1'), { wrapper })
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1))

    // Auth switches straight to B; the profile store lags behind and still says A.
    authSession.userId = B
    await act(async () => release(ok('saved')))

    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(Object.values(items())).toEqual([
      expect.objectContaining({ jurorId: A, key: 'team-1:crit-2', status: 'pending' }),
    ])
  })

  it('keeps a tap the server calls wrong_juror pending, and sends it once the owner is back', async () => {
    rpcReturns(ok('wrong_juror'), ok('saved'))
    const { wrapper } = setup()
    const { result } = renderHook(() => useScoreSync('ev-1'), { wrapper })

    tap()
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1))
    await act(async () => {})
    expect(result.current).toMatchObject({ pending: 1, rejected: 0 })
    expect(Object.values(items())).toEqual([
      expect.objectContaining({ jurorId: A, status: 'pending' }),
    ])

    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    await waitFor(() => expect(items()).toEqual({}))
    expect(mockRpc).toHaveBeenCalledTimes(2)
  })

  it('keeps the tap while offline and sends it when the browser comes back online', async () => {
    rpcReturns(offline, ok('saved'))
    const { wrapper } = setup()
    const { result } = renderHook(() => useScoreSync('ev-1'), { wrapper })

    tap()
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
    seed(queued())
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
    seed(queued())
    rpcReturns(offline, ok('saved'))
    const { wrapper } = setup()
    renderHook(() => useScoreSync('ev-1'), { wrapper })
    // Not vi.waitFor: it advances fake timers itself, which would skew the 10 s count.
    await settle()
    expect(mockRpc).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_999)
    })
    expect(mockRpc).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    await vi.waitFor(() => expect(items()).toEqual({}))
    expect(mockRpc).toHaveBeenCalledTimes(2)
  })

  it('counts pending and rejected for this event and juror only', () => {
    seed(
      queued({ key: 'a', status: 'rejected', reason: 'locked' }),
      queued({ key: 'b', status: 'rejected', reason: 'not_assigned' }),
      queued({ key: 'c', eventId: 'ev-2', status: 'rejected', reason: 'locked' }),
      queued({ key: 'd', jurorId: B }),
    )
    mockUseEvent.mockReturnValue({ data: event({ statusOverride: 'locked' }) })
    const { wrapper } = setup()

    const { result } = renderHook(() => useScoreSync('ev-1'), { wrapper })

    expect(result.current).toMatchObject({ pending: 0, rejected: 2 })
  })

  it('retries rejected taps when the event becomes open by time', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(new Date('2026-11-10T08:59:55.000Z')) // 5 s before starts_at
    seed(queued({ status: 'rejected', reason: 'not_open' }))
    rpcReturns(ok('saved'))
    const { wrapper } = setup()
    const { result } = renderHook(() => useScoreSync('ev-1'), { wrapper })
    expect(result.current.rejected).toBe(1)
    expect(mockRpc).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })

    await vi.waitFor(() => expect(items()).toEqual({}))
    expect(mockRpc).toHaveBeenCalledTimes(1)
  })

  it('resends a tap rejected not_open while the event already shows open, on the next tick', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(new Date('2026-11-10T09:00:01.000Z')) // client says open; server clock lags
    mockUseEvent.mockReturnValue({ data: event() })
    rpcReturns(ok('not_open'), ok('saved'))
    const { wrapper } = setup()
    const { result } = renderHook(() => useScoreSync('ev-1'), { wrapper })

    tap()
    await vi.waitFor(() => expect(result.current.rejected).toBe(1))
    expect(mockRpc).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })

    await vi.waitFor(() => expect(items()).toEqual({}))
    expect(mockRpc).toHaveBeenCalledTimes(2)
  })

  it('does not resend an invalid tap on every tick', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(new Date('2026-11-10T10:00:00.000Z'))
    seed(queued({ status: 'rejected', reason: 'invalid' }))
    const { wrapper } = setup()
    // Mounting while open retries every reason once; let that one go out and fail again.
    rpcReturns({ data: null, error: { message: 'bad value', code: '23514' }, status: 400 })
    renderHook(() => useScoreSync('ev-1'), { wrapper })
    await vi.waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(Object.values(items())).toEqual([
      expect.objectContaining({ status: 'rejected', reason: 'invalid' }),
    ])
  })

  it('retries rejected taps when an admin reopens the event', async () => {
    seed(queued({ status: 'rejected', reason: 'locked' }))
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

describe('useMyCellSync', () => {
  it("reports this juror's pending and rejected cells for the event only", () => {
    seed(
      queued({ key: 'team-1:crit-1', status: 'pending' }),
      queued({ key: 'team-1:crit-2', criterionId: 'crit-2', status: 'rejected', reason: 'locked' }),
      queued({ key: 'team-1:crit-3', criterionId: 'crit-3', jurorId: B }),
      queued({ key: 'team-9:crit-1', teamId: 'team-9', eventId: 'ev-2' }),
    )
    const { result } = renderHook(() => useMyCellSync('ev-1'))
    expect(result.current).toEqual({
      'team-1:crit-1': { status: 'pending' },
      'team-1:crit-2': { status: 'rejected', reason: 'locked' },
    })
  })
})

describe('juror notes', () => {
  /** Stand-in for `from('juror_notes').select('body').eq().eq().maybeSingle()`. */
  function noteReturns(body: string | null) {
    const eq = vi.fn()
    const chain = {
      eq,
      maybeSingle: () => Promise.resolve({ data: body === null ? null : { body }, error: null }),
    }
    eq.mockReturnValue(chain)
    mockFrom.mockReturnValue({ select: () => chain })
    return eq
  }

  it('useMyNote loads the juror’s own note for the team, or an empty string', async () => {
    const eq = noteReturns(null)
    const { wrapper } = setup()
    const { result } = renderHook(() => useMyNote('team-1'), { wrapper })
    await waitFor(() => expect(result.current.data).toBe(''))
    expect(mockFrom).toHaveBeenCalledWith('juror_notes')
    expect(eq).toHaveBeenCalledWith('team_id', 'team-1')
    expect(eq).toHaveBeenCalledWith('juror_id', A)
  })

  it('useSaveNote upserts once, 600 ms after the last edit, and caches the body', async () => {
    vi.useFakeTimers()
    const upsert = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockReturnValue({ upsert })
    const { wrapper, queryClient } = setup()
    const { result } = renderHook(() => useSaveNote(), { wrapper })

    act(() => result.current.save('team-1', 'Strong'))
    act(() => vi.advanceTimersByTime(NOTE_SAVE_DELAY_MS - 1))
    act(() => result.current.save('team-1', 'Strong demo'))
    act(() => vi.advanceTimersByTime(NOTE_SAVE_DELAY_MS - 1))
    expect(upsert).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(1))
    await settle()
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledWith(
      { team_id: 'team-1', juror_id: A, body: 'Strong demo' },
      { onConflict: 'team_id,juror_id' },
    )
    expect(queryClient.getQueryData(myNoteKey('team-1', A))).toBe('Strong demo')
    expect(result.current.status).toBe('saved')
  })

  it('useSaveNote saves a waiting edit right away on unmount', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockReturnValue({ upsert })
    const { wrapper } = setup()
    const { result, unmount } = renderHook(() => useSaveNote(), { wrapper })

    act(() => result.current.save('team-1', 'Remember the demo'))
    unmount()
    await settle()
    expect(upsert).toHaveBeenCalledWith(
      { team_id: 'team-1', juror_id: A, body: 'Remember the demo' },
      { onConflict: 'team_id,juror_id' },
    )
  })

  it('useSaveNote reports an error when the write fails', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: { message: 'offline' } })
    mockFrom.mockReturnValue({ upsert })
    const { wrapper } = setup()
    const { result } = renderHook(() => useSaveNote(), { wrapper })

    act(() => {
      result.current.save('team-1', 'x')
      result.current.flush()
    })
    await settle()
    expect(result.current.status).toBe('error')
  })
})
