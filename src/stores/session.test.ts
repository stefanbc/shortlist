import { waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
})
