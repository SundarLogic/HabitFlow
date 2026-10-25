/**
 * Showing SERVER validation errors in react-hook-form forms.
 *
 * The API answers bad input with 422 VALIDATION_ERROR and details like
 *   [{ location: 'body', path: 'password', message: 'must be at least 8 characters' }]
 * and business rules with specific codes (e.g. 409 EMAIL_TAKEN). applyServerErrors() puts each
 * message under its field; anything that can't be tied to a field becomes a form-level error
 * (errors.root.server), shown at the top of the form.
 */

/** "must be at least 8 characters" -> "Password must be at least 8 characters". */
function sentence(label, message) {
  if (!message) return `${label} is invalid`;
  return /^[a-z]/.test(message) ? `${label} ${message}` : message;
}

/**
 * @param {import('../services/apiClient.js').ApiError} error
 * @param {(name: string, error: { type: string, message: string }) => void} setError from useForm
 * @param {object} options
 * @param {Record<string, string>} options.fields form field name -> human label
 * @param {Record<string, string>} [options.codeToField] business error code -> field, e.g.
 *   { EMAIL_TAKEN: 'email' }
 */
export function applyServerErrors(error, setError, { fields, codeToField = {} }) {
  const fieldForCode = codeToField[error.code];
  if (fieldForCode) {
    setError(fieldForCode, { type: 'server', message: error.message });
    return;
  }
  if (error.code === 'VALIDATION_ERROR' && Array.isArray(error.details)) {
    let placed = false;
    for (const detail of error.details) {
      if (detail.location === 'body' && detail.path in fields) {
        setError(detail.path, {
          type: 'server',
          message: sentence(fields[detail.path], detail.message),
        });
        placed = true;
      }
    }
    if (placed) return;
  }
  setError('root.server', { type: 'server', message: error.message });
}
