import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { EventSubNav } from './EventSubNav'

function renderAt(initialPath: string) {
  const router = createMemoryRouter(
    [{ path: '/admin/events/:eventId/*', element: <EventSubNav eventId="ev-1" /> }],
    { initialEntries: [initialPath] },
  )
  render(<RouterProvider router={router} />)
}

describe('EventSubNav', () => {
  it('links every tab to the right route for this event', () => {
    renderAt('/admin/events/ev-1/settings')

    expect(screen.getByRole('link', { name: 'Event settings' })).toHaveAttribute(
      'href',
      '/admin/events/ev-1/settings',
    )
    expect(screen.getByRole('link', { name: 'Teams and projects' })).toHaveAttribute(
      'href',
      '/admin/events/ev-1/teams',
    )
    expect(screen.getByRole('link', { name: 'Criteria and themes' })).toHaveAttribute(
      'href',
      '/admin/events/ev-1/criteria',
    )
    expect(screen.getByRole('link', { name: 'Jurors' })).toHaveAttribute(
      'href',
      '/admin/events/ev-1/jurors',
    )
    expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute(
      'href',
      '/admin/events/ev-1/reports',
    )
  })

  it('marks the current tab with aria-current, and no other tab', () => {
    renderAt('/admin/events/ev-1/teams')

    expect(screen.getByRole('link', { name: 'Teams and projects' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Event settings' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Criteria and themes' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('marks Reports current on a nested report route', () => {
    renderAt('/admin/events/ev-1/reports/podium')

    expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute('aria-current', 'page')
  })

  it('scrolls horizontally inside its own bar instead of hiding tabs', () => {
    renderAt('/admin/events/ev-1/settings')

    const nav = screen.getByRole('navigation')
    expect(nav.className).toMatch(/overflow-x-auto/)
  })
})
