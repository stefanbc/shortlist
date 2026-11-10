import { render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from '@/stores/session'
import { RequireRole } from './guards'

type AuthCallback = (event: string, session: { user: { id: string } } | null) => void

// Plain closures (not vi.fn() mock state) so they survive Vitest's automatic
// mock-state reset between tests: the session store subscribes exactly once,
// during this file's initial import, and every test needs that same handle.
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

function renderGuarded(initialPath: string) {
  const routes = [
    { path: '/login', element: <div>Login page</div> },
    {
      path: '/admin',
      element: (
        <RequireRole role="admin">
          <div>Admin home</div>
        </RequireRole>
      ),
    },
    {
      path: '/score',
      element: (
        <RequireRole role="juror">
          <div>Juror home</div>
        </RequireRole>
      ),
    },
  ]
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] })
  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  useSession.setState({ status: 'loading', profile: null })
  mockSignOut.mockClear()
  toastError.mockClear()
})

describe('RequireRole', () => {
  it('shows a loading state before the session resolves', () => {
    renderGuarded('/admin')
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('redirects to /login when signed out', async () => {
    mockProfileRow(null)
    renderGuarded('/admin')
    emitSession(null)
    expect(await screen.findByText('Login page')).toBeInTheDocument()
  })

  it('sends a juror away from /admin to their own home', async () => {
    mockProfileRow({ id: 'j1', display_name: 'Jane', email: null, role: 'juror', active: true })
    renderGuarded('/admin')
    emitSession('j1')
    expect(await screen.findByText('Juror home')).toBeInTheDocument()
  })

  it('sends an admin away from /score to their own home', async () => {
    mockProfileRow({ id: 'a1', display_name: 'Ann', email: null, role: 'admin', active: true })
    renderGuarded('/score')
    emitSession('a1')
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
  })

  it('lets a matching role straight through', async () => {
    mockProfileRow({ id: 'a1', display_name: 'Ann', email: null, role: 'admin', active: true })
    renderGuarded('/admin')
    emitSession('a1')
    await waitFor(() => expect(screen.getByText('Admin home')).toBeInTheDocument())
  })

  it('signs out, toasts, and redirects to /login for a deactivated profile', async () => {
    mockProfileRow({ id: 'j1', display_name: 'Jane', email: null, role: 'juror', active: false })
    renderGuarded('/admin')
    emitSession('j1')

    expect(await screen.findByText('Login page')).toBeInTheDocument()
    expect(mockSignOut).toHaveBeenCalledTimes(1)
    expect(toastError).toHaveBeenCalledWith(
      'Your account was deactivated. Contact the event organizer.',
    )
  })
})
