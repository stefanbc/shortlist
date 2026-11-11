import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useState } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { EventRow } from '@/features/events/api'
import type { TeamWithProject } from '@/features/teams/api'
import { NowPitchingDialog } from './NowPitchingDialog'

const team = (id: string, name: string, pitchOrder: number): TeamWithProject => ({
  id,
  name,
  pitchOrder,
  noShow: false,
  manualTiebreak: null,
  members: [],
  project: { name: null, description: null, themeId: null, repoUrl: null },
})

const TEAMS = [team('t1', 'Team Orion', 1), team('t2', 'Team Vega', 2), team('t3', 'Nimbus', 3)]

const event = (nowPitchingTeamId: string | null, since = '2026-11-10T10:00:00.000Z'): EventRow => ({
  id: 'ev-1',
  name: 'Astra Hack',
  startsAt: '2026-11-10T08:00:00.000Z',
  endsAt: '2026-11-10T20:00:00.000Z',
  statusOverride: 'auto',
  lockedAt: null,
  pitchMinutes: 7,
  nowPitchingTeamId,
  nowPitchingSince: nowPitchingTeamId ? since : null,
})

/** Lets a test push a new event row into the rendered dialog, as Realtime would. */
const control: { setEvent(event: EventRow): void } = { setEvent: () => {} }
const setEvent = (event: EventRow) => control.setEvent(event)

function Host({ initial }: { initial: EventRow }) {
  const [current, setCurrent] = useState(initial)
  useEffect(() => {
    control.setEvent = setCurrent
  }, [])
  return <NowPitchingDialog event={current} teams={TEAMS} currentTeamId="t1" />
}

function renderDialog(initial: EventRow) {
  const router = createMemoryRouter(
    [
      { path: '/score/:eventId/t1', element: <Host initial={initial} /> },
      { path: '/score/:eventId/:teamId', element: <p>Scoring other team</p> },
    ],
    { initialEntries: ['/score/ev-1/t1'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('NowPitchingDialog', () => {
  it('does not prompt for the team already pitching when the screen opens', () => {
    renderDialog(event('t2'))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('does not prompt when the current team starts pitching', () => {
    renderDialog(event(null))
    act(() => setEvent(event('t1')))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('now-pitching change shows dialog; Stay keeps current team', async () => {
    const user = userEvent.setup()
    const router = renderDialog(event('t1'))

    act(() => setEvent(event('t2', '2026-11-10T10:07:00.000Z')))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Team Vega is now pitching')

    await user.click(screen.getByRole('button', { name: 'Stay here' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(router.state.location.pathname).toBe('/score/ev-1/t1')

    // Same change again (e.g. a refetch): stays dismissed.
    act(() => setEvent({ ...event('t2', '2026-11-10T10:07:00.000Z') }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    // The next change asks again.
    act(() => setEvent(event('t3', '2026-11-10T10:14:00.000Z')))
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Nimbus is now pitching')
  })

  it('Switch navigates to the pitching team', async () => {
    const user = userEvent.setup()
    const router = renderDialog(event(null))

    act(() => setEvent(event('t2')))
    await user.click(await screen.findByRole('button', { name: 'Switch' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/score/ev-1/t2'))
    expect(await screen.findByText('Scoring other team')).toBeInTheDocument()
  })
})
