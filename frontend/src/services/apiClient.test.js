/**
 * apiClient: CSRF header on writes (fetching the token first when the cookie is missing),
 * X-Workspace-Id, error normalisation, and the 401 handler.
 */
import { HttpResponse, http } from 'msw';
import { apiError, server } from '../test/server.js';
import { ApiError, api, setActiveWorkspaceId, setUnauthorizedHandler } from './apiClient.js';

/** Captures the headers of the next request to `path` and answers 200 {}. */
function captureHeaders(method, path) {
  const seen = {};
  server.use(
    http[method](path, ({ request }) => {
      seen.csrf = request.headers.get('X-CSRF-Token');
      seen.workspace = request.headers.get('X-Workspace-Id');
      return HttpResponse.json({});
    }),
  );
  return seen;
}

afterEach(() => {
  setActiveWorkspaceId(null);
  setUnauthorizedHandler(null);
});

describe('CSRF', () => {
  it('sends X-CSRF-Token from the csrf_token cookie on POST/PUT/PATCH/DELETE', async () => {
    document.cookie = 'csrf_token=abc123; path=/';
    for (const method of ['post', 'put', 'patch', 'delete']) {
      const seen = captureHeaders(method, '/api/v1/things');
      await api[method]('/things');
      expect(seen.csrf).toBe('abc123');
    }
  });

  it('does not send it on GET', async () => {
    document.cookie = 'csrf_token=abc123; path=/';
    const seen = captureHeaders('get', '/api/v1/things');
    await api.get('/things');
    expect(seen.csrf).toBeNull();
  });

  it('fetches a token from GET /auth/csrf first when the cookie is missing', async () => {
    let csrfCalls = 0;
    server.use(
      http.get('/api/v1/auth/csrf', () => {
        csrfCalls += 1;
        document.cookie = 'csrf_token=fresh-token; path=/';
        return HttpResponse.json({ csrfToken: 'fresh-token' });
      }),
    );
    const seen = captureHeaders('post', '/api/v1/things');
    await api.post('/things', {});
    expect(csrfCalls).toBe(1);
    expect(seen.csrf).toBe('fresh-token');
  });
});

it('sends X-Workspace-Id once a workspace is selected', async () => {
  const before = captureHeaders('get', '/api/v1/things');
  await api.get('/things');
  expect(before.workspace).toBeNull();

  setActiveWorkspaceId('ws-123');
  const after = captureHeaders('get', '/api/v1/things');
  await api.get('/things');
  expect(after.workspace).toBe('ws-123');
});

describe('errors', () => {
  it('normalises API errors into ApiError { status, code, message, details }', async () => {
    const details = [{ location: 'body', path: 'name', message: 'is required' }];
    server.use(
      http.get('/api/v1/things', () =>
        apiError(422, 'VALIDATION_ERROR', 'Request validation failed', details),
      ),
    );
    const error = await api.get('/things').catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details,
    });
  });

  it('turns a network failure into NETWORK_ERROR (status 0)', async () => {
    server.use(http.get('/api/v1/things', () => HttpResponse.error()));
    const error = await api.get('/things').catch((e) => e);
    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('calls the unauthorized handler on 401 UNAUTHENTICATED only', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    server.use(
      http.get('/api/v1/things', () => apiError(401, 'UNAUTHENTICATED', 'Authentication required')),
    );
    await api.get('/things').catch(() => {});
    expect(onUnauthorized).toHaveBeenCalledTimes(1);

    // A wrong password is also a 401 but must NOT log the user out / redirect.
    server.use(
      http.get('/api/v1/things', () =>
        apiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password'),
      ),
    );
    await api.get('/things').catch(() => {});
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
