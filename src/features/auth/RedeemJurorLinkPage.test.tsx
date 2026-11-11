import { FunctionsHttpError } from '@supabase/supabase-js'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { RedeemJurorLinkPage } from './RedeemJurorLinkPage'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    // onAuthStateChange: the page's preferences menu reads the session store, which
    // subscribes to auth changes when it loads.
    auth: { verifyOtp: vi.fn(), onAuthStateChange: vi.fn() },
  },
}))

/** A FunctionsHttpError whose context exposes `.json()`, matching the shape
 * supabase-js gives a non-2xx edge function response. */
function httpError(body: { error: string }) {
  return new FunctionsHttpError({ json: () => Promise.resolve(body) })
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/j/:token', element: <RedeemJurorLinkPage /> },
      { path: '/score', element: <div>Score home</div> },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('RedeemJurorLinkPage', () => {
  it('redeems the token, exchanges it for a session, and lands on /score', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { tokenHash: 'hashed-token' },
      error: null,
    } as never)
    vi.mocked(supabase.auth.verifyOtp).mockResolvedValue({ error: null } as never)

    const router = renderAt('/j/good-token')

    expect(await screen.findByText('Score home')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/score')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('juror-link', {
      body: { action: 'redeem', token: 'good-token' },
    })
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: 'hashed-token',
      type: 'magiclink',
    })
  })

  it('shows the revoked-link message for an invalid token', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: httpError({ error: 'invalid_token' }),
    } as never)

    renderAt('/j/bad-token')

    expect(await screen.findByText('This link no longer works')).toBeInTheDocument()
    expect(
      screen.getByText(
        'It may have been replaced by a newer one. Ask the organizer for your current link.',
      ),
    ).toBeInTheDocument()
  })

  it('shows a paused message for an inactive juror', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: httpError({ error: 'inactive' }),
    } as never)

    renderAt('/j/paused-token')

    expect(await screen.findByText('This link is paused')).toBeInTheDocument()
  })
})
