/**
 * Route guards (layout routes in App.jsx):
 *   <ProtectedRoute>   only for logged-in users; others go to /login?returnTo=<this page>
 *   <PublicOnlyRoute>  login/signup; a logged-in user is sent to returnTo (or Today)
 *
 * While /auth/me is loading, a full-page spinner avoids flashing the wrong page.
 * (The real protection is the API: every endpoint checks the session. These guards are UX.)
 */
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { Spinner } from '../../components/ui/index.js';
import { loginUrl, safeReturnTo } from '../../lib/redirect.js';
import { useAuth } from './AuthProvider.jsx';

function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center text-brand-600">
      <Spinner size="lg" label="Loading HabitFlow" />
    </div>
  );
}

export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'anonymous') {
    return <Navigate to={loginUrl(location.pathname + location.search)} replace />;
  }
  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { status } = useAuth();
  const [searchParams] = useSearchParams();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'authenticated') {
    return <Navigate to={safeReturnTo(searchParams.get('returnTo'))} replace />;
  }
  return <Outlet />;
}
