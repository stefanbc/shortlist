import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SCORE_QUEUE_STORAGE_KEY,
  ScoreRejectedError,
  queueId,
  UNKNOWN_JUROR,
  useScoreQueue,
  type QueuedScore,
  type SaveResult,
  type SendScore,
} from './scoreQueue'

const T0 = new Date('2026-11-10T10:00:00.000Z')
const T1 = new Date('2026-11-10T10:00:05.000Z')

const A = 'juror-a'
const B = 'juror-b'

const cell = (
  overrides: Partial<{
    eventId: string
    teamId: string
    criterionId: string
    jurorId: string
  }> = {},
) => ({
  jurorId: A,
  eventId: 'ev-1',
  teamId: 'team-1',
  criterionId: 'crit-1',
  ...overrides,
})

/** A promise the test resolves or rejects by hand, to control when a send settles. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const items = () => useScoreQueue.getState().items
/** The queued item for a cell, owned by `jurorId` (A unless given). */
const item = (key: string, jurorId = A) =>
  Object.values(items()).find((i) => i.key === key && i.jurorId === jurorId)
const enqueue = (...args: Parameters<ReturnType<typeof useScoreQueue.getState>['enqueue']>) =>
  useScoreQueue.getState().enqueue(...args)
const flush = (send: SendScore, jurorId = A) => useScoreQueue.getState().flush(send, jurorId)

beforeEach(() => {
  localStorage.clear()
  useScoreQueue.setState({ items: {} })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('scoreQueue', () => {
  it('enqueue replaces value for same key', () => {
    enqueue({ ...cell(), value: 3 }, T0)
    enqueue({ ...cell(), value: 4.5 }, T1)

    expect(Object.values(items())).toEqual([
      {
        key: 'team-1:crit-1',
        jurorId: A,
        eventId: 'ev-1',
        teamId: 'team-1',
        criterionId: 'crit-1',
        value: 4.5,
        tappedAt: T1.toISOString(),
        status: 'pending',
      },
    ])
  })

  it('enqueue keeps tappedAt strictly increasing per key, even within one millisecond', () => {
    enqueue({ ...cell(), value: 3 }, T0)
    enqueue({ ...cell(), value: 4 }, T0)

    expect(item('team-1:crit-1')!.value).toBe(4)
    expect(item('team-1:crit-1')!.tappedAt > T0.toISOString()).toBe(true)
  })

  it('saved removes item', async () => {
    enqueue({ ...cell(), value: 3 }, T0)
    enqueue({ ...cell({ criterionId: 'crit-2' }), value: null }, T0)
    const send = vi.fn<SendScore>().mockResolvedValue('saved')

    await flush(send)

    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ key: 'team-1:crit-1', value: 3 }))
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'team-1:crit-2', value: null }),
    )
    expect(items()).toEqual({})
  })

  it('stale in-flight save does not remove newer value', async () => {
    enqueue({ ...cell(), value: 3 }, T0)
    const first = deferred<SaveResult>()
    const second = deferred<SaveResult>()
    const sent: QueuedScore[] = []
    const send = vi.fn<SendScore>((q) => {
      sent.push(q)
      return sent.length === 1 ? first.promise : second.promise
    })

    const flushing = flush(send)
    expect(sent[0].value).toBe(3)

    // The juror taps 4 while the save for 3 is still in flight…
    enqueue({ ...cell(), value: 4 }, T1)
    // …then the save for 3 lands.
    first.resolve('saved')
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2))

    expect(item('team-1:crit-1')!).toMatchObject({
      value: 4,
      status: 'pending',
      tappedAt: T1.toISOString(),
    })
    expect(sent[1].value).toBe(4)

    second.resolve('saved')
    await flushing
    expect(items()).toEqual({})
  })

  it('network error keeps item pending and stops flush', async () => {
    enqueue({ ...cell(), value: 3 }, T0)
    enqueue({ ...cell({ criterionId: 'crit-2' }), value: 2 }, T0)
    const send = vi.fn<SendScore>().mockRejectedValue(new TypeError('Failed to fetch'))

    await flush(send)

    expect(send).toHaveBeenCalledTimes(1)
    expect(item('team-1:crit-1')!).toMatchObject({ value: 3, status: 'pending' })
    expect(item('team-1:crit-2')!).toMatchObject({ value: 2, status: 'pending' })
  })

  it('wrong_juror keeps the item pending (never removed or rejected) and stops the flush', async () => {
    enqueue({ ...cell(), value: 3 }, T0)
    enqueue({ ...cell({ criterionId: 'crit-2' }), value: 2 }, T0)
    const send = vi.fn<SendScore>().mockResolvedValue('wrong_juror')

    await flush(send)

    expect(send).toHaveBeenCalledTimes(1)
    expect(item('team-1:crit-1')).toMatchObject({ value: 3, status: 'pending' })
    expect(item('team-1:crit-1')!.reason).toBeUndefined()
    expect(item('team-1:crit-2')).toMatchObject({ value: 2, status: 'pending' })
  })

  it('locked marks rejected with reason', async () => {
    enqueue({ ...cell(), value: 3 }, T0)
    enqueue({ ...cell({ criterionId: 'crit-2' }), value: 2 }, T0)
    const send = vi
      .fn<SendScore>()
      .mockResolvedValueOnce('locked')
      .mockResolvedValueOnce('not_open')

    await flush(send)

    expect(item('team-1:crit-1')!).toMatchObject({
      value: 3,
      status: 'rejected',
      reason: 'locked',
    })
    expect(item('team-1:crit-2')!).toMatchObject({
      value: 2,
      status: 'rejected',
      reason: 'not_open',
    })
  })

  it('a permanent server rejection marks the item invalid and the queue moves on', async () => {
    enqueue({ ...cell(), value: 3 }, T0)
    enqueue({ ...cell({ criterionId: 'crit-2' }), value: 2 }, T0)
    const send = vi
      .fn<SendScore>()
      .mockRejectedValueOnce(new ScoreRejectedError('criterion does not belong to the event'))
      .mockResolvedValueOnce('saved')

    await flush(send)

    expect(send).toHaveBeenCalledTimes(2)
    expect(Object.values(items())).toEqual([
      expect.objectContaining({ key: 'team-1:crit-1', status: 'rejected', reason: 'invalid' }),
    ])
  })

  it('retryRejected only affects that event', async () => {
    enqueue({ ...cell(), value: 3 }, T0)
    enqueue({ ...cell({ eventId: 'ev-2', teamId: 'team-9' }), value: 2 }, T0)
    await flush(vi.fn<SendScore>().mockResolvedValue('locked'))

    useScoreQueue.getState().retryRejected('ev-1', A)

    expect(item('team-1:crit-1')!.status).toBe('pending')
    expect(item('team-1:crit-1')!.reason).toBeUndefined()
    expect(item('team-9:crit-1')!).toMatchObject({ status: 'rejected', reason: 'locked' })
  })

  it('discardRejected drops a rejected item and never a pending one', async () => {
    enqueue({ ...cell(), value: 3 }, T0)
    await flush(vi.fn<SendScore>().mockResolvedValue('locked'))
    enqueue({ ...cell({ criterionId: 'crit-2' }), value: 4 }, T0)
    const rejectedId = queueId(item('team-1:crit-1')!)
    const pendingId = queueId(item('team-1:crit-2')!)

    useScoreQueue.getState().discardRejected(pendingId)
    expect(item('team-1:crit-2')!.status).toBe('pending')

    useScoreQueue.getState().discardRejected(rejectedId)
    expect(item('team-1:crit-1')).toBeUndefined()
    expect(item('team-1:crit-2')!.status).toBe('pending')
  })

  it('concurrent flush calls share one run (no double send)', async () => {
    enqueue({ ...cell(), value: 3 }, T0)
    const first = deferred<SaveResult>()
    const send = vi.fn<SendScore>(() => first.promise)

    const a = flush(send)
    const b = flush(send)
    first.resolve('saved')
    await Promise.all([a, b])

    expect(send).toHaveBeenCalledTimes(1)
    expect(items()).toEqual({})
  })

  it('state survives store rehydration from localStorage', async () => {
    enqueue({ ...cell(), value: 3.5 }, T0)
    expect(
      JSON.parse(localStorage.getItem(SCORE_QUEUE_STORAGE_KEY) ?? '{}').state.items,
    ).toHaveProperty(['juror-a/team-1:crit-1'])

    // Simulate a reload: a fresh module instance reads only what localStorage holds.
    vi.resetModules()
    const fresh = await import('./scoreQueue')

    expect(Object.values(fresh.useScoreQueue.getState().items)[0]).toMatchObject({
      value: 3.5,
      status: 'pending',
      tappedAt: T0.toISOString(),
    })
  })

  it('keeps working in memory when localStorage throws (private mode)', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })

    expect(() => enqueue({ ...cell(), value: 3 }, T0)).not.toThrow()
    expect(item('team-1:crit-1')!.value).toBe(3)

    await flush(vi.fn<SendScore>().mockResolvedValue('saved'))
    expect(items()).toEqual({})
  })

  it("a juror's taps are never sent under another juror's session, and survive until the owner returns", async () => {
    enqueue({ ...cell({ jurorId: A }), value: 3 }, T0)
    const send = vi.fn<SendScore>().mockResolvedValue('saved')

    await flush(send, B)

    expect(send).not.toHaveBeenCalled()
    expect(item('team-1:crit-1', A)).toMatchObject({ value: 3, status: 'pending' })

    await flush(send, A)

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ jurorId: A, value: 3 }))
    expect(items()).toEqual({})
  })

  it('keeps the same cell separately for two jurors', () => {
    enqueue({ ...cell({ jurorId: A }), value: 3 }, T0)
    enqueue({ ...cell({ jurorId: B }), value: 5 }, T1)

    expect(item('team-1:crit-1', A)!.value).toBe(3)
    expect(item('team-1:crit-1', B)!.value).toBe(5)
  })

  it('retryRejected can be limited to the given reasons and to one juror', async () => {
    enqueue({ ...cell(), value: 3 }, T0)
    enqueue({ ...cell({ criterionId: 'crit-2' }), value: 2 }, T0)
    enqueue({ ...cell({ jurorId: B }), value: 4 }, T0)
    await flush(
      vi.fn<SendScore>().mockResolvedValueOnce('not_open').mockResolvedValueOnce('locked'),
    )
    await flush(vi.fn<SendScore>().mockResolvedValue('not_open'), B)

    useScoreQueue.getState().retryRejected('ev-1', A, ['not_open', 'not_assigned'])

    expect(item('team-1:crit-1')!.status).toBe('pending')
    expect(item('team-1:crit-2')).toMatchObject({ status: 'rejected', reason: 'locked' })
    expect(item('team-1:crit-1', B)).toMatchObject({ status: 'rejected', reason: 'not_open' })
  })

  it('migrates a v1 queue: legacy items without an owner are kept but quarantined, never sent', async () => {
    localStorage.setItem(
      SCORE_QUEUE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        state: {
          items: {
            'team-1:crit-1': {
              key: 'team-1:crit-1',
              eventId: 'ev-1',
              teamId: 'team-1',
              criterionId: 'crit-1',
              value: 3.5,
              tappedAt: T0.toISOString(),
              status: 'pending',
            },
          },
        },
      }),
    )

    vi.resetModules()
    const fresh = await import('./scoreQueue')
    const migrated = Object.values(fresh.useScoreQueue.getState().items)

    expect(migrated).toEqual([
      expect.objectContaining({
        key: 'team-1:crit-1',
        value: 3.5,
        tappedAt: T0.toISOString(),
        jurorId: UNKNOWN_JUROR,
        status: 'rejected',
        reason: 'invalid',
      }),
    ])
    const send = vi.fn<SendScore>().mockResolvedValue('saved')
    fresh.useScoreQueue.getState().retryRejected('ev-1', A)
    await fresh.useScoreQueue.getState().flush(send, A)
    expect(send).not.toHaveBeenCalled()
    expect(Object.values(fresh.useScoreQueue.getState().items)).toHaveLength(1)
  })
})
