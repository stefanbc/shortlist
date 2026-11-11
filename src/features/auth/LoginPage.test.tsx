import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession, type Profile } from '@/stores/session'
import { LoginPage } from './LoginPage'

const { signInWithPassword, signInWithOtp } = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signInWithOtp: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signInWithPassword,
      signInWithOtp,
      signOut: vi.fn(),
    },
    from: vi.fn(),
  },
}))

const admin: Profile = { id: 'a1', displayName: 'Ann', email: 'ann@example.test', role: 'admin', active: true }
const juror: Profile = { id: 'j1', displayName: 'Jo', email: null, role: 'juror', active: true }

function renderLogin() {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginPage /> },
      { path: '/admin', element: <div>Admin home</div> },
      { path: '/score', element: <div>Juror home</div> },
    ],
    { initialEntries: ['/login'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  useSession.setState({ status: 'signedOut', profile: null })
  signInWithPassword.mockReset()
  signInWithOtp.mockReset()
})

describe('LoginPage', () => {
  it('a password sign-in lands the admin on /admin once the session resolves', async () => {
    const user = userEvent.setup()
    signInWithPassword.mockImplementation(async () => {
      // The real client emits SIGNED_IN; the session store then loads the profile.
      useSession.setState({ status: 'signedIn', profile: admin })
      return { data: {}, error: null }
    })
    const router = renderLogin()

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'ann@example.test')
    await user.type(screen.getByLabelText('Password', { selector: 'input' }), 'secret-pass')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Admin home')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin')
  })

  it('wrong credentials stay on the form with an error', async () => {
    const user = userEvent.setup()
    signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'Invalid login' } })
    const router = renderLogin()

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'ann@example.test')
    await user.type(screen.getByLabelText('Password', { selector: 'input' }), 'nope')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Incorrect email or password.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('an already signed-in admin is sent straight to /admin', async () => {
    useSession.setState({ status: 'signedIn', profile: admin })
    renderLogin()
    expect(await screen.findByText('Admin home')).toBeInTheDocument()
  })

  it('an already signed-in juror is sent to /score', async () => {
    useSession.setState({ status: 'signedIn', profile: juror })
    renderLogin()
    expect(await screen.findByText('Juror home')).toBeInTheDocument()
  })

  it('magic links come back to the app root, which routes by role', async () => {
    vi.stubEnv('VITE_APP_URL', 'https://shortlist.example/')
    const user = userEvent.setup()
    signInWithOtp.mockResolvedValue({ data: {}, error: null })
    renderLogin()

    await user.click(screen.getByRole('tab', { name: 'Email link' }))
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'ann@example.test')
    await user.click(screen.getByRole('button', { name: 'Send me a link' }))

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'ann@example.test',
      options: { shouldCreateUser: false, emailRedirectTo: 'https://shortlist.example/' },
    })
    vi.unstubAllEnvs()
  })
})
