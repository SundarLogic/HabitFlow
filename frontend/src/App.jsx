/**
 * Routes of the app (React Router data router).
 *
 *   /login, /signup             PublicOnlyRoute (logged-in users are sent on)
 *   /, /habits, /habits/:id,
 *   /analytics, /settings       ProtectedRoute + AppShell (sidebar / bottom bar)
 *   *                           404 page
 * Every route renders RouteErrorPage if it crashes (errorElement on the root).
 *
 * `routes` is exported separately so tests can mount the real route table in a memory router.
 */
import { Outlet, RouterProvider, createBrowserRouter } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell.jsx';
import { AuthProvider } from './features/auth/AuthProvider.jsx';
import { ProtectedRoute, PublicOnlyRoute } from './features/auth/RouteGuards.jsx';
import { LoginPage, SignupPage } from './pages/AuthPages.jsx';
import { NotFoundPage, RouteErrorPage } from './pages/ErrorPages.jsx';
import { AnalyticsPage, HabitDetailPage, HabitsPage } from './pages/PlaceholderPages.jsx';
import { SettingsPage } from './pages/SettingsPage.jsx';
import { TodayPage } from './pages/TodayPage.jsx';

/** AuthProvider needs the router (it navigates), so it lives in the root route's element. */
function RootLayout() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

export const routes = [
  {
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <PublicOnlyRoute />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/signup', element: <SignupPage /> },
        ],
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppShell />,
            children: [
              { path: '/', element: <TodayPage /> },
              { path: '/habits', element: <HabitsPage /> },
              { path: '/habits/:id', element: <HabitDetailPage /> },
              { path: '/analytics', element: <AnalyticsPage /> },
              { path: '/settings', element: <SettingsPage /> },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

const router = createBrowserRouter(routes);

export function App() {
  return <RouterProvider router={router} />;
}
