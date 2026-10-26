/**
 * AuthProvider + useAuth(): who is logged in, and the login / signup / logout actions.
 *
 * The source of truth is the server: GET /auth/me, cached by TanStack Query under ['auth','me'].
 * A page refresh simply re-asks the server; the HttpOnly session cookie keeps the user logged in.
 *
 *   const { status, user, login, logout } = useAuth();
 *   status: 'loading' | 'authenticated' | 'anonymous'
 *
 * It also registers the apiClient's 401 handler: when any request reports that the session is
 * gone (expired, logged out elsewhere, password changed on another device), the cached user is
 * cleared, other cached data is dropped, and protected pages redirect to /login?returnTo=...
 *
 * Must render inside the router (it navigates) and inside QueryClientProvider.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { queryKeys } from '../../lib/queryClient.js';
import { loginUrl } from '../../lib/redirect.js';
import { setUnauthorizedHandler } from '../../services/apiClient.js';
import { useToast } from '../../components/ui/index.js';
import * as authApi from './api.js';

const AuthContext = createContext(null);

/** Pages that work without a session; a 401 there must not bounce the user to /login. */
const PUBLIC_PATHS = ['/login', '/signup'];

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  // The handler below runs outside React's render, so it reads the CURRENT route from a ref.
  const location = useLocation();
  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  const meQuery = useQuery({
    queryKey: queryKeys.me,
    queryFn: authApi.fetchMe,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    setUnauthorizedHandler(() => {
      // Only a session that EXISTED and was lost needs handling here. An anonymous visitor
      // (e.g. the start-up /auth/me 401 on a 404 page) is left alone; ProtectedRoute decides.
      const wasLoggedIn = Boolean(queryClient.getQueryData(queryKeys.me));
      if (!wasLoggedIn) return;
      // Forget everything that belonged to the old session, keep the (now empty) auth entry.
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
      queryClient.setQueryData(queryKeys.me, null);
      const { pathname, search } = locationRef.current;
      if (!PUBLIC_PATHS.includes(pathname)) {
        // Say why we left the page: the session expired, or was ended on another device.
        toast.info('Your session has ended', {
          description: 'Log in again to continue. You will come back to this page.',
        });
        navigate(loginUrl(pathname + search), { replace: true });
      }
    });
    return () => setUnauthorizedHandler(null);
  }, [queryClient, navigate, toast]);

  /** After login/signup: load the full /auth/me (workspaces, plan) into the cache. */
  const refreshMe = useCallback(async () => {
    const me = await authApi.fetchMe();
    queryClient.setQueryData(queryKeys.me, me);
    return me;
  }, [queryClient]);

  const login = useCallback(
    async (credentials) => {
      await authApi.login(credentials);
      return refreshMe();
    },
    [refreshMe],
  );

  const signup = useCallback(
    async (fields) => {
      await authApi.signup(fields);
      return refreshMe();
    },
    [refreshMe],
  );

  /**
   * Forgets everything cached for this session and leaves to `to` (after logout, or after the
   * account was deleted).
   */
  const endSession = useCallback(
    (to = '/login') => {
      queryClient.clear();
      queryClient.setQueryData(queryKeys.me, null);
      navigate(to, { replace: true });
    },
    [queryClient, navigate],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      // Even if the request failed (offline), forget everything locally and leave.
      endSession('/login');
    }
  }, [endSession]);

  /** Updates the cached user after a profile change (no refetch needed). */
  const setUser = useCallback(
    (user) => queryClient.setQueryData(queryKeys.me, (me) => (me ? { ...me, user } : me)),
    [queryClient],
  );

  const me = meQuery.data ?? null;
  let status = 'anonymous';
  if (meQuery.isPending) status = 'loading';
  else if (me) status = 'authenticated';

  const value = useMemo(
    () => ({
      status,
      user: me?.user ?? null,
      workspaces: me?.workspaces ?? [],
      activeWorkspaceId: me?.activeWorkspaceId ?? null,
      plan: me?.plan ?? null,
      error: meQuery.error,
      login,
      signup,
      logout,
      endSession,
      setUser,
    }),
    [status, me, meQuery.error, login, signup, logout, endSession, setUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * @returns {{ status: 'loading'|'authenticated'|'anonymous', user: object|null,
 *   workspaces: object[], activeWorkspaceId: string|null, plan: object|null, error: Error|null,
 *   login: Function, signup: Function, logout: Function, endSession: (to?: string) => void,
 *   setUser: (user: object) => void }}
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
