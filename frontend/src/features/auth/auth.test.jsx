/**
 * Authentication flows through the REAL route table (renderApp): route guards, login and signup
 * forms (client validation and server errors), logout, and an expired session mid-use.
 */
import { screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { currentUrl, renderApp } from '../../test/renderApp.jsx';
import { apiError, backend, server } from '../../test/server.js';

describe('route guards', () => {
  it('sends an anonymous visitor to /login, remembering where they wanted to go', async () => {
    const { router } = renderApp('/habits?status=all');
    await screen.findByRole('heading', { name: 'Welcome back' });
    expect(currentUrl(router)).toBe('/login?returnTo=%2Fhabits%3Fstatus%3Dall');
  });

  it('shows the app to a logged-in user, and keeps them logged in on a refresh', async () => {
    backend.loggedIn = true;
    const first = renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Today' })).toBeInTheDocument();
    expect(await screen.findByText("Let's build your first habit")).toBeInTheDocument();
    first.unmount();

    // A "refresh" = a brand-new app with an empty cache; the session (cookie) still exists.
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Today' })).toBeInTheDocument();
  });

  it('sends a logged-in user away from /login', async () => {
    backend.loggedIn = true;
    const { router } = renderApp('/login');
    await screen.findByRole('heading', { name: 'Today' });
    expect(currentUrl(router)).toBe('/');
  });

  it('shows a 404 page for unknown URLs', async () => {
    renderApp('/no/such/page');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});

describe('login form', () => {
  it('validates before calling the API', async () => {
    let called = false;
    server.use(
      http.post('/api/v1/auth/login', () => {
        called = true;
        return HttpResponse.json({});
      }),
    );
    const { user } = renderApp('/login');
    await user.click(await screen.findByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Enter your email address')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/)).toHaveAttribute('aria-invalid', 'true');

    await user.type(screen.getByLabelText(/Email/), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText(/Enter a valid email address/)).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('shows the server error for wrong credentials, without blaming one field', async () => {
    const { user } = renderApp('/login');
    await user.type(await screen.findByLabelText(/Email/), 'ana@example.com');
    await user.type(screen.getByLabelText(/Password/), 'wrong-pass-1');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    const alert = await screen.findByText('Invalid email or password');
    expect(alert.closest('[role="alert"]')).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/)).not.toHaveAttribute('aria-invalid');
  });

  it('puts server field errors (422) under their fields', async () => {
    server.use(
      http.post('/api/v1/auth/login', () =>
        apiError(422, 'VALIDATION_ERROR', 'Request validation failed', [
          { location: 'body', path: 'email', message: 'must be a valid email address' },
        ]),
      ),
    );
    const { user } = renderApp('/login');
    await user.type(await screen.findByLabelText(/Email/), 'ana@example.com');
    await user.type(screen.getByLabelText(/Password/), 'x');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Email must be a valid email address')).toBeInTheDocument();
  });

  it('logs in and returns to the page the user wanted', async () => {
    const { user, router } = renderApp('/settings');
    await user.type(await screen.findByLabelText(/Email/), 'ana@example.com');
    await user.type(screen.getByLabelText(/Password/), 'correct-horse-42');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(currentUrl(router)).toBe('/settings');
  });

  it('ignores an unsafe returnTo (open redirect)', async () => {
    const { user, router } = renderApp('/login?returnTo=%2F%2Fevil.example');
    await user.type(await screen.findByLabelText(/Email/), 'ana@example.com');
    await user.type(screen.getByLabelText(/Password/), 'correct-horse-42');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    await screen.findByRole('heading', { name: 'Today' });
    expect(currentUrl(router)).toBe('/');
  });
});

describe('signup form', () => {
  it('pre-fills the detected timezone and shows password guidance', async () => {
    const { user } = renderApp('/signup');
    const timezone = await screen.findByLabelText(/Timezone/);
    expect(timezone.value).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);

    await user.type(screen.getByLabelText(/^Password/), 'abcdefgh1');
    expect(screen.getByText('Strength: Good')).toBeInTheDocument();
  });

  it('maps 409 EMAIL_TAKEN to the email field', async () => {
    server.use(
      http.post('/api/v1/auth/signup', () =>
        apiError(409, 'EMAIL_TAKEN', 'An account with this email already exists'),
      ),
    );
    const { user } = renderApp('/signup');
    await user.type(await screen.findByLabelText(/Name/), 'Ana');
    await user.type(screen.getByLabelText(/Email/), 'ana@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'correct-horse-42');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText('An account with this email already exists'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('validates the password rules on the client', async () => {
    const { user } = renderApp('/signup');
    await user.type(await screen.findByLabelText(/Name/), 'Ana');
    await user.type(screen.getByLabelText(/Email/), 'ana@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'lettersonly');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Include at least one number')).toBeInTheDocument();
  });

  it('signs up and lands on the empty Today page', async () => {
    const { user, router } = renderApp('/signup');
    await user.type(await screen.findByLabelText(/Name/), 'Ana Lima');
    await user.type(screen.getByLabelText(/Email/), 'ana@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'correct-horse-42');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText("Let's build your first habit")).toBeInTheDocument();
    expect(currentUrl(router)).toBe('/');
  });
});

describe('session end', () => {
  it('logs out from the user menu', async () => {
    backend.loggedIn = true;
    const { user, router } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: /Account menu for Ana Lima/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Log out' }));

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(currentUrl(router)).toBe('/login');
    expect(backend.loggedIn).toBe(false);
  });

  it('redirects to /login with returnTo when the session expires mid-use', async () => {
    backend.loggedIn = true;
    const { router, queryClient } = renderApp('/settings');
    await screen.findByRole('heading', { name: 'Settings' });

    // The session dies server-side (expired, or password changed on another device). The next
    // background refetch (like the unread-count poll) answers 401 UNAUTHENTICATED.
    backend.loggedIn = false;
    await queryClient.invalidateQueries();

    await waitFor(() => expect(currentUrl(router)).toBe('/login?returnTo=%2Fsettings'));
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });
});
