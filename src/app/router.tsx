import { Navigate, type RouteObject } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/features/auth/LoginPage'
import { RedeemJurorLinkPage } from '@/features/auth/RedeemJurorLinkPage'
import { CriteriaPage } from '@/features/criteria/CriteriaPage'
import { EventSettingsPage } from '@/features/events/EventSettingsPage'
import { EventsPage } from '@/features/events/EventsPage'
import { TeamsPage } from '@/features/teams/TeamsPage'
import { EventJurorsPage } from '@/features/users/EventJurorsPage'
import { UsersPage } from '@/features/users/UsersPage'
import { RequireRole } from './guards'
import { PlaceholderPage } from './PlaceholderPage'
import { NotFoundPage, RouteErrorPage } from './RouteStatus'

// Placeholder pages are replaced feature by feature in later tasks.
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
          { index: true, element: <PlaceholderPage title="scoring.title" /> },
          { path: ':eventId/:teamId', element: <PlaceholderPage title="scoring.scoreTeam" /> },
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
          { index: true, element: <PlaceholderPage title="dashboard.title" /> },
          { path: 'events', element: <EventsPage /> },
          {
            path: 'events/:eventId',
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
                  { path: 'podium', element: <PlaceholderPage title="reports.podium" /> },
                  { path: 'ranking', element: <PlaceholderPage title="reports.ranking" /> },
                  { path: 'criteria', element: <PlaceholderPage title="reports.criteria" /> },
                  { path: 'jurors', element: <PlaceholderPage title="reports.jurors" /> },
                  { path: 'teams/:teamId', element: <PlaceholderPage title="reports.team" /> },
                ],
              },
            ],
          },
          { path: 'users', element: <UsersPage /> },
          { path: 'import', element: <PlaceholderPage title="import.title" /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
