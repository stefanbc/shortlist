import { Navigate, type RouteObject } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { PlaceholderPage } from './PlaceholderPage'
import { NotFoundPage, RouteErrorPage } from './RouteStatus'

// Placeholder pages are replaced feature by feature in later tasks.
// Auth guards arrive with the session store (Task 8).
export const routes: RouteObject[] = [
  {
    errorElement: <RouteErrorPage />,
    children: [
      { path: '/', element: <Navigate to="/login" replace /> },
      { path: '/login', element: <PlaceholderPage title="auth.signIn" standalone /> },
      { path: '/j/:token', element: <PlaceholderPage title="auth.redeemLink" standalone /> },
      {
        path: '/score',
        element: <AppShell section="juror" />,
        children: [
          { index: true, element: <PlaceholderPage title="scoring.title" /> },
          { path: ':eventId/:teamId', element: <PlaceholderPage title="scoring.scoreTeam" /> },
        ],
      },
      {
        path: '/admin',
        element: <AppShell section="admin" />,
        children: [
          { index: true, element: <PlaceholderPage title="dashboard.title" /> },
          { path: 'events', element: <PlaceholderPage title="events.title" /> },
          {
            path: 'events/:eventId',
            children: [
              { index: true, element: <Navigate to="settings" replace /> },
              { path: 'settings', element: <PlaceholderPage title="events.settings" /> },
              { path: 'teams', element: <PlaceholderPage title="events.teams" /> },
              { path: 'criteria', element: <PlaceholderPage title="events.criteria" /> },
              { path: 'jurors', element: <PlaceholderPage title="events.jurors" /> },
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
          { path: 'users', element: <PlaceholderPage title="users.title" /> },
          { path: 'import', element: <PlaceholderPage title="import.title" /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
