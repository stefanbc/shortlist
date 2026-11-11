import { waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from './session'

type AuthCallback = (event: string, session: { user: { id: string } } | null) => void

// Plain closures (not vi.fn() mock state) so they survive Vitest's automatic
// mock-state reset between tests — see guards.test.tsx for the same pattern.
const { authCallbacks, mockFrom, mockSignOut } = vi.hoisted(() => ({
  authCallbacks: [] as AuthCallback[],
  mockFrom: vi.fn(),
  mockSignOut: vi.fn().mockResolvedValue({ error: null }),
}))

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn((cb: AuthCallback) => {
        authCallbacks.push(cb)
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }),
      signOut: mockSignOut,
    },
    from: mockFrom,
  },
}))

vi.mock('sonner', () => ({
  toast: { error: toastError },
}))

type ProfileRow = {
  id: string
  display_name: string
  email: string | null
  role: string
  active: boolean
}

/** Stubs `supabase.from('profiles').select(...).eq(...).maybeSingle()` to resolve with `row`. */
function mockProfileRow(row: ProfileRow | null) {
  mockFrom.mockReturnValue({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: row, error: null }),
      }),
    }),
  })
}

/** Fires the auth-state callback the session store registered at import time. */
function emitSession(userId: string | null) {
  authCallbacks[0]?.('SIGNED_IN', userId ? { user: { id: userId } } : null)
}

beforeEach(() => {
  useSession.setState({ status: 'loading', profile: null })
  mockSignOut.mockClear()
  toastError.mockClear()
})

describe('useSession', () => {
  it('signs a deactivated profile out and toasts the deactivated message', async () => {
    mockProfileRow({ id: 'j1', display_name: 'Jane', email: null, role: 'juror', active: false })

    emitSession('j1')

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1))
    expect(toastError).toHaveBeenCalledWith(
      'Your account was deactivated. Contact the event organizer.',
    )
    expect(useSession.getState()).toMatchObject({ status: 'signedOut', profile: null })
  })

  it('an active profile signs in normally without signing out or toasting', async () => {
    mockProfileRow({ id: 'a1', display_name: 'Ann', email: null, role: 'admin', active: true })

    emitSession('a1')

    await waitFor(() => expect(useSession.getState().status).toBe('signedIn'))
    expect(mockSignOut).not.toHaveBeenCalled()
    expect(toastError).not.toHaveBeenCalled()
  })

  it('does not leave status at a stale signedOut while a new sign-in is resolving', async () => {
    // Mirrors a juror opening their link: the store already settled 'signedOut' (the
    // client's initial, session-less check) by the time the real sign-in event arrives.
    useSession.setState({ status: 'signedOut', profile: null })
    mockProfileRow({ id: 'a1', display_name: 'Ann', email: null, role: 'admin', active: true })

    emitSession('a1')

    // A guarded route reading status right here (before the profile fetch settles) must
    // see 'loading', not the stale 'signedOut' -- otherwise it redirects to /login, and
    // nothing ever navigates a signed-in user away from there once the fetch does resolve.
    expect(useSession.getState().status).toBe('loading')

    await waitFor(() => expect(useSession.getState().status).toBe('signedIn'))
  })

  it('signs out when the profile row is definitively missing', async () => {
    useSession.setState({
      status: 'signedIn',
      profile: { id: 'a1', displayName: 'Ann', email: null, role: 'admin', active: true },
    })
    mockProfileRow(null)

    emitSession('a1')

    await waitFor(() => expect(useSession.getState().status).toBe('signedOut'))
    expect(useSession.getState().profile).toBeNull()
  })
})

describe('useSession on a flaky network', () => {
  const ann = { id: 'a1', displayName: 'Ann', email: null, role: 'admin' as const, active: true }
  const annRow = { id: 'a1', display_name: 'Ann', email: null, role: 'admin', active: true }

  /** Stubs the profile lookup with a queue of outcomes, one per call, in order. */
  function mockProfileLookups(...outcomes: Array<'networkError' | 'rejected' | ProfileRow>) {
    const queue = [...outcomes]
    const calls = { count: 0 }
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => {
            calls.count += 1
            const next = queue.length > 1 ? queue.shift()! : queue[0]
            if (next === 'rejected') return Promise.reject(new TypeError('Failed to fetch'))
            if (next === 'networkError') {
              // What postgrest-js resolves with when fetch itself fails (phone just woke,
              // wifi not back yet): no data, an error with no HTTP status behind it.
              return Promise.resolve({
                data: null,
                error: { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' },
              })
            }
            return Promise.resolve({ data: next, error: null })
          },
        }),
      }),
    }))
    return calls
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps a signed-in juror signed in when the profile refetch hits a network error', async () => {
    useSession.setState({ status: 'signedIn', profile: ann })
    const calls = mockProfileLookups('networkError', annRow)

    // auth-js re-emits SIGNED_IN when the tab becomes visible again.
    emitSession('a1')
    await vi.advanceTimersByTimeAsync(0)

    expect(useSession.getState()).toMatchObject({ status: 'signedIn', profile: ann })
    expect(mockSignOut).not.toHaveBeenCalled()

    // ...and it retries on its own rather than giving up.
    await vi.advanceTimersByTimeAsync(30_000)
    expect(calls.count).toBeGreaterThanOrEqual(2)
    expect(useSession.getState()).toMatchObject({ status: 'signedIn', profile: ann })
  })

  it('keeps the session when the profile fetch rejects outright, and retries with backoff', async () => {
    useSession.setState({ status: 'signedIn', profile: ann })
    const calls = mockProfileLookups('rejected', 'rejected', annRow)

    emitSession('a1')
    await vi.advanceTimersByTimeAsync(0)
    expect(calls.count).toBe(1)
    expect(useSession.getState().status).toBe('signedIn')

    await vi.advanceTimersByTimeAsync(1_000)
    expect(calls.count).toBe(2)
    // The second wait is longer than the first.
    await vi.advanceTimersByTimeAsync(1_000)
    expect(calls.count).toBe(2)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(calls.count).toBe(3)
    expect(useSession.getState()).toMatchObject({ status: 'signedIn', profile: ann })
  })

  it('a cold start offline waits (retrying) instead of bouncing to /login, then signs in', async () => {
    useSession.setState({ status: 'loading', profile: null })
    mockProfileLookups('networkError', annRow)

    emitSession('a1')
    await vi.advanceTimersByTimeAsync(0)
    expect(useSession.getState().status).toBe('loading')

    await vi.advanceTimersByTimeAsync(30_000)
    expect(useSession.getState()).toMatchObject({ status: 'signedIn', profile: ann })
  })

  it('a missing row found on retry still signs out', async () => {
    useSession.setState({ status: 'signedIn', profile: ann })
    mockProfileLookups('networkError', null as unknown as ProfileRow)

    emitSession('a1')
    await vi.advanceTimersByTimeAsync(0)
    expect(useSession.getState().status).toBe('signedIn')

    await vi.advanceTimersByTimeAsync(30_000)
    expect(useSession.getState()).toMatchObject({ status: 'signedOut', profile: null })
  })

  it('an inactive profile found on retry signs out and toasts', async () => {
    useSession.setState({ status: 'signedIn', profile: ann })
    mockProfileLookups('networkError', { ...annRow, active: false })

    emitSession('a1')
    await vi.advanceTimersByTimeAsync(30_000)

    expect(useSession.getState()).toMatchObject({ status: 'signedOut', profile: null })
    expect(mockSignOut).toHaveBeenCalledTimes(1)
    expect(toastError).toHaveBeenCalledWith(
      'Your account was deactivated. Contact the event organizer.',
    )
  })

  it('a sign-out while a retry is pending cancels the retry', async () => {
    useSession.setState({ status: 'signedIn', profile: ann })
    const calls = mockProfileLookups('networkError', annRow)

    emitSession('a1')
    await vi.advanceTimersByTimeAsync(0)
    emitSession(null)
    await vi.advanceTimersByTimeAsync(30_000)

    expect(calls.count).toBe(1)
    expect(useSession.getState()).toMatchObject({ status: 'signedOut', profile: null })
  })
})
