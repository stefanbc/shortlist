import { describe, expect, it, vi } from 'vitest'

// Records which page modules have been evaluated. A vi.mock factory runs the first time its
// module is imported, so a flag still false after importing the route table means that page
// is not part of the bundle a juror's phone downloads up front.
const loaded = vi.hoisted(() => new Set<string>())

function track(name: string) {
  return async (importOriginal: () => Promise<unknown>) => {
    loaded.add(name)
    return (await importOriginal()) as object
  }
}

vi.mock('@/features/dashboard/DashboardPage', track('dashboard'))
vi.mock('@/features/events/EventsPage', track('events'))
vi.mock('@/features/import/ImportPage', track('import'))
vi.mock('@/features/reports/PodiumPage', track('podium'))
vi.mock('@/features/reports/RankingPage', track('ranking'))
vi.mock('@/features/users/UsersPage', track('users'))
vi.mock('@/features/teams/TeamsPage', track('teams'))
vi.mock('@/features/scoring/ScoringPage', track('scoring'))
vi.mock('@/features/scoring/JurorHomePage', track('jurorHome'))

describe('route-level code splitting', () => {
  it('loads the juror screens up front but none of the organizer screens', async () => {
    await import('./router')

    expect(loaded.has('scoring')).toBe(true)
    expect(loaded.has('jurorHome')).toBe(true)
    for (const adminPage of ['dashboard', 'events', 'import', 'podium', 'ranking', 'users', 'teams']) {
      expect(loaded.has(adminPage), adminPage).toBe(false)
    }
  })
})
