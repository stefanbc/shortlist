import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { routes } from './router'

// Route gating is RequireRole's own concern (see guards.test.tsx); here we only
// care that each route renders in the right shell AND is wired to the right role,
// so the guard is a passthrough that records which role it was given.
vi.mock('./guards', () => ({
  RequireRole: ({ role, children }: { role: 'admin' | 'juror'; children: ReactNode }) => (
    <div data-guard-role={role}>{children}</div>
  ),
}))

// EventsPage/EventSettingsPage own their data-fetching behaviour (see their own tests);
// here we only need them to render without a QueryClientProvider or a live backend.
vi.mock('@/features/events/api', () => ({
  useEvents: () => ({ data: [], isLoading: false }),
  useEvent: () => ({ data: undefined, isLoading: true }),
  useSaveEvent: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetEventStatus: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCopyEvent: () => ({ mutateAsync: vi.fn(), isPending: false }),
  toDateTimeLocal: (value: string) => value,
  fromDateTimeLocal: (value: string) => value,
}))

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

describe('router', () => {
  it('admin pages sit in the shell with the organizer navigation', async () => {
    const user = userEvent.setup()
    const router = renderAt('/admin')
    expect(await screen.findByRole('heading', { name: 'Live event' })).toBeInTheDocument()

    const [nav] = screen.getAllByRole('navigation', { name: 'Main navigation' })
    expect(within(nav).getByRole('link', { name: 'Live' })).toHaveAttribute('aria-current', 'page')

    await user.click(within(nav).getByRole('link', { name: 'Events' }))
    expect(router.state.location.pathname).toBe('/admin/events')
    expect(screen.getByRole('heading', { name: 'Events' })).toBeInTheDocument()
  })

  it('event and report index routes land on their first screen', async () => {
    const router = renderAt('/admin/events/e1/reports')
    expect(await screen.findByRole('heading', { name: 'Podium' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin/events/e1/reports/podium')
  })

  it('juror scoring uses the slim shell without organizer navigation', async () => {
    renderAt('/score/e1/t1')
    expect(await screen.findByRole('heading', { name: 'Score team' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Preferences' })).toBeInTheDocument()
  })

  it('unknown addresses show a way back', async () => {
    renderAt('/nowhere')
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to start' })).toHaveAttribute('href', '/')
  })

  it('gates /admin behind the admin role guard', async () => {
    renderAt('/admin')
    await screen.findByRole('heading', { name: 'Live event' })
    expect(document.querySelector('[data-guard-role="admin"]')).toBeInTheDocument()
  })

  it('gates /score behind the juror role guard', async () => {
    renderAt('/score/e1/t1')
    await screen.findByRole('heading', { name: 'Score team' })
    expect(document.querySelector('[data-guard-role="juror"]')).toBeInTheDocument()
  })
})
