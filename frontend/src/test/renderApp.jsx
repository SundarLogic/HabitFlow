/**
 * Renders the REAL app (route table, providers, AuthProvider) at a given URL, in a memory router.
 *
 *   const { user, router } = renderApp('/habits');
 *   await user.click(screen.getByRole('button', { name: 'Log in' }));
 *   expect(router.state.location.pathname).toBe('/');
 *
 * Each call gets a fresh query cache, so tests never share server data.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from '../App.jsx';
import { ToastProvider } from '../components/ui/index.js';
import { createQueryClient } from '../lib/queryClient.js';
import { ThemeProvider } from '../lib/theme.jsx';

export function renderApp(path = '/') {
  const queryClient = createQueryClient();
  // No retries in tests: an error should show immediately, not after a retry delay.
  queryClient.setDefaultOptions({ queries: { retry: false, staleTime: 0 } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const result = render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
  return { ...result, router, queryClient, user: userEvent.setup() };
}

/** Current URL of a memory router, e.g. '/login?returnTo=%2Fhabits'. */
export function currentUrl(router) {
  const { pathname, search } = router.state.location;
  return pathname + search;
}

/**
 * The value shown on a StatCard, found by its label: `await statValue('Completion rate')` -> '50%'.
 * Waits for the card to appear.
 */
export async function statValue(label) {
  const term = await screen.findByText(label, { selector: 'dt' });
  return term.nextElementSibling.textContent;
}
