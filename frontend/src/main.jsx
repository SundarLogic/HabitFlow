/**
 * Entry point: mounts the app with its providers, outermost first:
 *   AppErrorBoundary  catches crashes anywhere (shows a reload screen)
 *   ThemeProvider     light / dark / system
 *   QueryClientProvider  server-data cache (TanStack Query)
 *   ToastProvider     toast messages
 *   App               the router (AuthProvider sits inside it)
 *
 * Before rendering we ask the API for a CSRF cookie (GET /auth/csrf), so the very first form
 * submission already has a token. If it fails (API down), the client retries before each write.
 */
// First: Zod settings must be in place before any schema module runs (see the file).
import './lib/zodConfig.js';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import { ToastProvider } from './components/ui/index.js';
import { createQueryClient } from './lib/queryClient.js';
import { ThemeProvider } from './lib/theme.jsx';
import { AppErrorBoundary } from './pages/ErrorPages.jsx';
import { ensureCsrfToken } from './services/apiClient.js';
import './styles/index.css';

ensureCsrfToken().catch(() => {
  // Not fatal: the next non-GET request fetches the token again.
});

const queryClient = createQueryClient();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <App />
          </ToastProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
