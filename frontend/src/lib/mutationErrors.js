/**
 * One way to report a failed save (a mutation), used by the optimistic toggles and other actions:
 *
 *   onError: (error, done) => reportMutationError(toast, "Couldn't mark it done", error, () => retry())
 *
 *   - Session gone (401 UNAUTHENTICATED): no toast. AuthProvider already explains it and sends
 *     the user to the login page, so a second "couldn't save" message would only confuse.
 *   - Offline / server unreachable (status 0): the toast gets a "Retry" button.
 *   - Anything else: the API's own message (already written for people).
 */

/**
 * @param {{ error: Function }} toast from useToast()
 * @param {string} title what failed, e.g. `Couldn't mark "Read" done`
 * @param {import('../services/apiClient.js').ApiError} error
 * @param {() => void} [retry] repeats the action; offered only for network failures
 */
export function reportMutationError(toast, title, error, retry) {
  if (error?.code === 'UNAUTHENTICATED') return;
  const offline = error?.status === 0;
  toast.error(title, {
    description: error?.message,
    ...(offline && retry ? { action: { label: 'Retry', onClick: retry } } : {}),
  });
}
