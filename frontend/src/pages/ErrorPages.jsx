/**
 * Error screens:
 *   NotFoundPage        unknown URL (the router's "*" route)
 *   RouteErrorPage      a page crashed while rendering or loading (router errorElement)
 *   AppErrorBoundary    last line of defence around the whole app (errors outside the router)
 * None of them show technical details to users; developers see the error in the console (dev).
 */
import { Compass, RotateCcw } from 'lucide-react';
import { Component } from 'react';
import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { Button, EmptyState } from '../components/ui/index.js';
import { usePageTitle } from '../hooks/usePageTitle.js';

const HOME_LINK =
  'inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700';

function CenteredPage({ children }) {
  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}

export function NotFoundPage() {
  usePageTitle('Page not found');
  return (
    <CenteredPage>
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="The page you're looking for doesn't exist or has moved."
        action={
          <Link to="/" className={HOME_LINK}>
            Go to Today
          </Link>
        }
      />
    </CenteredPage>
  );
}

/** Used as the router's errorElement. A 404 thrown by a route renders the not-found page. */
export function RouteErrorPage() {
  const error = useRouteError();
  usePageTitle('Something went wrong');
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  return <CrashScreen />;
}

function CrashScreen() {
  return (
    <CenteredPage>
      <div role="alert">
        <EmptyState
          icon={RotateCcw}
          title="Something went wrong"
          description="An unexpected error stopped this page. Reloading usually fixes it; your data is safe."
          action={<Button onClick={() => window.location.reload()}>Reload page</Button>}
        />
      </div>
    </CenteredPage>
  );
}

/**
 * React error boundaries must be class components (there is no hook for componentDidCatch).
 */
export class AppErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? <CrashScreen /> : this.props.children;
  }
}
