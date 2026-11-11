import { lazy, Suspense, type ComponentType } from 'react'
import { Navigate, type RouteObject } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/features/auth/LoginPage'
import { RedeemJurorLinkPage } from '@/features/auth/RedeemJurorLinkPage'
import { JurorHomePage } from '@/features/scoring/JurorHomePage'
import { ScoringPage } from '@/features/scoring/ScoringPage'
import { RequireRole, RoleHomeRedirect } from './guards'
import { NotFoundPage, PageLoading, RouteErrorPage } from './RouteStatus'

/** An organizer page, loaded on first visit: jurors' phones only ever download the
 * sign-in and scoring screens, never the admin, report, export or import code. */
function adminPage<M>(load: () => Promise<M>, name: keyof M) {
  const Page = lazy(async () => ({ default: (await load())[name] as ComponentType }))
  return (
    <Suspense fallback={<PageLoading />}>
      <Page />
    </Suspense>
  )
}

const dashboardPage = adminPage(() => import('@/features/dashboard/DashboardPage'), 'DashboardPage')
const eventsPage = adminPage(() => import('@/features/events/EventsPage'), 'EventsPage')
const eventShell = adminPage(() => import('@/features/events/EventShell'), 'EventShell')
const eventSettingsPage = adminPage(
  () => import('@/features/events/EventSettingsPage'),
  'EventSettingsPage',
)
const teamsPage = adminPage(() => import('@/features/teams/TeamsPage'), 'TeamsPage')
const criteriaPage = adminPage(() => import('@/features/criteria/CriteriaPage'), 'CriteriaPage')
const eventJurorsPage = adminPage(() => import('@/features/users/EventJurorsPage'), 'EventJurorsPage')
const podiumPage = adminPage(() => import('@/features/reports/PodiumPage'), 'PodiumPage')
const rankingPage = adminPage(() => import('@/features/reports/RankingPage'), 'RankingPage')
const criteriaReportPage = adminPage(
  () => import('@/features/reports/CriteriaReportPage'),
  'CriteriaReportPage',
)
const jurorReportPage = adminPage(() => import('@/features/reports/JurorReportPage'), 'JurorReportPage')
const teamBreakdownPage = adminPage(
  () => import('@/features/reports/TeamBreakdownPage'),
  'TeamBreakdownPage',
)
const usersPage = adminPage(() => import('@/features/users/UsersPage'), 'UsersPage')
const importPage = adminPage(() => import('@/features/import/ImportPage'), 'ImportPage')
const stagePage = adminPage(() => import('@/features/timer/StagePage'), 'StagePage')

export const routes: RouteObject[] = [
  {
    errorElement: <RouteErrorPage />,
    children: [
      { path: '/', element: <RoleHomeRedirect /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/j/:token', element: <RedeemJurorLinkPage /> },
      {
        path: '/score',
        element: (
          <RequireRole role="juror">
            <AppShell section="juror" />
          </RequireRole>
        ),
        children: [
          { index: true, element: <JurorHomePage /> },
          { path: ':eventId/:teamId', element: <ScoringPage /> },
        ],
      },
      {
        path: '/admin',
        element: (
          <RequireRole role="admin">
            <AppShell section="admin" />
          </RequireRole>
        ),
        children: [
          { index: true, element: dashboardPage },
          { path: 'events', element: eventsPage },
          {
            path: 'events/:eventId',
            element: eventShell,
            children: [
              { index: true, element: <Navigate to="settings" replace /> },
              { path: 'settings', element: eventSettingsPage },
              { path: 'teams', element: teamsPage },
              { path: 'criteria', element: criteriaPage },
              { path: 'jurors', element: eventJurorsPage },
              {
                path: 'reports',
                children: [
                  { index: true, element: <Navigate to="podium" replace /> },
                  { path: 'podium', element: podiumPage },
                  { path: 'ranking', element: rankingPage },
                  { path: 'criteria', element: criteriaReportPage },
                  { path: 'jurors', element: jurorReportPage },
                  { path: 'teams/:teamId', element: teamBreakdownPage },
                ],
              },
            ],
          },
          { path: 'users', element: usersPage },
          { path: 'import', element: importPage },
        ],
      },
      // The projector page: organizer-only, but outside the shell so it fills the screen.
      { path: '/stage/:eventId', element: <RequireRole role="admin">{stagePage}</RequireRole> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
