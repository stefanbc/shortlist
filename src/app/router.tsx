import { Navigate, type RouteObject } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/features/auth/LoginPage'
import { RedeemJurorLinkPage } from '@/features/auth/RedeemJurorLinkPage'
import { CriteriaPage } from '@/features/criteria/CriteriaPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { EventShell } from '@/features/events/EventShell'
import { EventSettingsPage } from '@/features/events/EventSettingsPage'
import { EventsPage } from '@/features/events/EventsPage'
import { ImportPage } from '@/features/import/ImportPage'
import { CriteriaReportPage } from '@/features/reports/CriteriaReportPage'
import { JurorReportPage } from '@/features/reports/JurorReportPage'
import { PodiumPage } from '@/features/reports/PodiumPage'
import { RankingPage } from '@/features/reports/RankingPage'
import { TeamBreakdownPage } from '@/features/reports/TeamBreakdownPage'
import { JurorHomePage } from '@/features/scoring/JurorHomePage'
import { ScoringPage } from '@/features/scoring/ScoringPage'
import { TeamsPage } from '@/features/teams/TeamsPage'
import { EventJurorsPage } from '@/features/users/EventJurorsPage'
import { UsersPage } from '@/features/users/UsersPage'
import { RequireRole } from './guards'
import { NotFoundPage, RouteErrorPage } from './RouteStatus'


export const routes: RouteObject[] = [
  {
    errorElement: <RouteErrorPage />,
    children: [
      { path: '/', element: <Navigate to="/login" replace /> },
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
          { index: true, element: <DashboardPage /> },
          { path: 'events', element: <EventsPage /> },
          {
            path: 'events/:eventId',
            element: <EventShell />,
            children: [
              { index: true, element: <Navigate to="settings" replace /> },
              { path: 'settings', element: <EventSettingsPage /> },
              { path: 'teams', element: <TeamsPage /> },
              { path: 'criteria', element: <CriteriaPage /> },
              { path: 'jurors', element: <EventJurorsPage /> },
              {
                path: 'reports',
                children: [
                  { index: true, element: <Navigate to="podium" replace /> },
                  { path: 'podium', element: <PodiumPage /> },
                  { path: 'ranking', element: <RankingPage /> },
                  { path: 'criteria', element: <CriteriaReportPage /> },
                  { path: 'jurors', element: <JurorReportPage /> },
                  { path: 'teams/:teamId', element: <TeamBreakdownPage /> },
                ],
              },
            ],
          },
          { path: 'users', element: <UsersPage /> },
          { path: 'import', element: <ImportPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
