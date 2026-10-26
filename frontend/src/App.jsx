/**
 * Routes of the app (React Router data router).
 *
 *   /login, /signup             PublicOnlyRoute (logged-in users are sent on)
 *   /, /habits, /habits/:id,
 *   /analytics, /settings       ProtectedRoute + AppShell (sidebar / bottom bar)
 *   *                           404 page
 * Every route renders RouteErrorPage if it crashes (errorElement on the root).
 * The heavier pages (habit detail, analytics with its charts, settings) are lazy-loaded: their
 * code is downloaded the first time they are visited, which keeps the first load small.
 *
 * `routes` is exported separately so tests can mount the real route table in a memory router.
 */
import { Suspense, lazy } from 'react';
import { Outlet, RouterProvider, createBrowserRouter } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell.jsx';
import { AuthProvider } from './features/auth/AuthProvider.jsx';
import { ProtectedRoute, PublicOnlyRoute } from './features/auth/RouteGuards.jsx';
import { LoginPage, SignupPage } from './pages/AuthPages.jsx';
import { Spinner } from './components/ui/index.js';
import { NotFoundPage, RouteErrorPage } from './pages/ErrorPages.jsx';
import { HabitsPage } from './pages/HabitsPage.jsx';
import { TodayPage } from './pages/TodayPage.jsx';

// React.lazy needs a default export; our pages use named exports, so map them.
const HabitDetailPage = lazy(() =>
  import('./pages/HabitDetailPage.jsx').then((m) => ({ default: m.HabitDetailPage })),
);
const AnalyticsPage = lazy(() =>
  import('./pages/AnalyticsPage.jsx').then((m) => ({ default: m.AnalyticsPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage.jsx').then((m) => ({ default: m.SettingsPage })),
);

/** Shows a spinner while a lazy page's code downloads. */
function LazyPage({ page: Page }) {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <Spinner label="Loading page" />
        </div>
      }
    >
      <Page />
    </Suspense>
  );
}

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
              { path: '/habits/:id', element: <LazyPage page={HabitDetailPage} /> },
              { path: '/analytics', element: <LazyPage page={AnalyticsPage} /> },
              { path: '/settings', element: <LazyPage page={SettingsPage} /> },
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
