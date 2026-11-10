import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { toEventRow, useActiveEvent } from './api'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

/** A minimal stand-in for the chainable supabase query builder: `.select().order()`
 * resolves to `{ data, error: null }`, matching what `useEvents` awaits. */
function mockEventsQuery(rows: unknown[]) {
  return {
    select: () => ({
      order: () => Promise.resolve({ data: rows, error: null }),
    }),
  }
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('toEventRow', () => {
  it('maps the snake_case DB row to a camelCase EventRow', () => {
    expect(
      toEventRow({
        id: 'ev-1',
        name: 'Astra Hack',
        starts_at: '2026-01-01T09:00:00.000Z',
        ends_at: '2026-01-01T18:00:00.000Z',
        status_override: 'locked',
        locked_at: '2026-01-01T18:00:00.000Z',
        pitch_minutes: 7,
        now_pitching_team_id: 'team-3',
        now_pitching_since: '2026-01-01T12:00:00.000Z',
      }),
    ).toEqual({
      id: 'ev-1',
      name: 'Astra Hack',
      startsAt: '2026-01-01T09:00:00.000Z',
      endsAt: '2026-01-01T18:00:00.000Z',
      statusOverride: 'locked',
      lockedAt: '2026-01-01T18:00:00.000Z',
      pitchMinutes: 7,
      nowPitchingTeamId: 'team-3',
      nowPitchingSince: '2026-01-01T12:00:00.000Z',
    })
  })

  it('passes through null locked_at / now_pitching fields', () => {
    const row = toEventRow({
      id: 'ev-2',
      name: 'Astra Hack 2',
      starts_at: '2026-02-01T09:00:00.000Z',
      ends_at: '2026-02-01T18:00:00.000Z',
      status_override: 'auto',
      locked_at: null,
      pitch_minutes: 7,
      now_pitching_team_id: null,
      now_pitching_since: null,
    })
    expect(row.lockedAt).toBeNull()
    expect(row.nowPitchingTeamId).toBeNull()
    expect(row.nowPitchingSince).toBeNull()
  })
})

describe('useActiveEvent', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('returns the open event even when other events are listed first', async () => {
    const open = {
      id: 'open',
      name: 'Open event',
      starts_at: '2026-06-10T00:00:00.000Z',
      ends_at: '2026-06-20T00:00:00.000Z',
      status_override: 'auto',
      locked_at: null,
      pitch_minutes: 7,
      now_pitching_team_id: null,
      now_pitching_since: null,
    }
    const upcoming = {
      ...open,
      id: 'upcoming',
      name: 'Upcoming event',
      starts_at: '2026-06-25T00:00:00.000Z',
      ends_at: '2026-06-26T00:00:00.000Z',
    }
    vi.mocked(supabase.from).mockReturnValue(mockEventsQuery([upcoming, open]) as never)

    const { result } = renderHook(() => useActiveEvent(), { wrapper })

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current?.id).toBe('open')
  })

  it('falls back to the soonest upcoming event when none is open', async () => {
    const later = {
      id: 'later',
      name: 'Starts later',
      starts_at: '2026-06-20T00:00:00.000Z',
      ends_at: '2026-06-21T00:00:00.000Z',
      status_override: 'auto',
      locked_at: null,
      pitch_minutes: 7,
      now_pitching_team_id: null,
      now_pitching_since: null,
    }
    const sooner = {
      ...later,
      id: 'sooner',
      name: 'Starts sooner',
      starts_at: '2026-06-17T00:00:00.000Z',
      ends_at: '2026-06-18T00:00:00.000Z',
    }
    const past = {
      ...later,
      id: 'past',
      name: 'Already locked',
      starts_at: '2026-06-01T00:00:00.000Z',
      ends_at: '2026-06-05T00:00:00.000Z',
    }
    // Pre-sorted by starts_at descending, matching the real query's `.order()`.
    vi.mocked(supabase.from).mockReturnValue(mockEventsQuery([later, sooner, past]) as never)

    const { result } = renderHook(() => useActiveEvent(), { wrapper })

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current?.id).toBe('sooner')
  })

  it('falls back to the most recent event when none is open or upcoming', async () => {
    const older = {
      id: 'older',
      name: 'Older event',
      starts_at: '2026-05-01T00:00:00.000Z',
      ends_at: '2026-05-02T00:00:00.000Z',
      status_override: 'auto',
      locked_at: null,
      pitch_minutes: 7,
      now_pitching_team_id: null,
      now_pitching_since: null,
    }
    const mostRecent = {
      ...older,
      id: 'most-recent',
      name: 'Most recent event',
      starts_at: '2026-06-01T00:00:00.000Z',
      ends_at: '2026-06-02T00:00:00.000Z',
    }
    // Pre-sorted by starts_at descending, matching the real query's `.order()`.
    vi.mocked(supabase.from).mockReturnValue(mockEventsQuery([mostRecent, older]) as never)

    const { result } = renderHook(() => useActiveEvent(), { wrapper })

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current?.id).toBe('most-recent')
  })
})
