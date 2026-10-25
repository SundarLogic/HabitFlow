/**
 * /login and /signup. The forms live in features/auth; these pages add the frame, the title and
 * the link to the other page (keeping ?returnTo so the user still lands where they wanted).
 */
import { Link, useSearchParams } from 'react-router-dom';
import { AuthLayout } from '../components/layout/AuthLayout.jsx';
import { LoginForm } from '../features/auth/LoginForm.jsx';
import { SignupForm } from '../features/auth/SignupForm.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';

const LINK = 'font-medium text-brand-600 hover:underline dark:text-brand-300';

/** Carries ?returnTo across the login <-> signup switch. */
function useReturnToQuery() {
  const [params] = useSearchParams();
  const returnTo = params.get('returnTo');
  return returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '';
}

export function LoginPage() {
  usePageTitle('Log in');
  const query = useReturnToQuery();
  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to keep your streaks going."
      footer={
        <>
          New to HabitFlow?{' '}
          <Link to={`/signup${query}`} className={LINK}>
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthLayout>
  );
}

export function SignupPage() {
  usePageTitle('Sign up');
  const query = useReturnToQuery();
  return (
    <AuthLayout
      title="Create your account"
      subtitle="Small steps, every day. It's free."
      footer={
        <>
          Already have an account?{' '}
          <Link to={`/login${query}`} className={LINK}>
            Log in
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthLayout>
  );
}
