/**
 * validate.js — checks incoming request data against Zod schemas before the controller runs.
 *
 * Example (in a route file):
 *   const createHabitSchema = z.object({ name: z.string().min(1), targetPerWeek: z.number().int() });
 *   router.post('/habits', validate({ body: createHabitSchema }), habitController.create);
 *
 * What it does:
 *   - Valid input: req.body / req.params / req.query are REPLACED with Zod's parsed output.
 *     Strings are converted to numbers where the schema says so, defaults are filled in, and
 *     unknown fields are removed. So the controller can trust req.body completely.
 *   - Invalid input: the request stops here and the client gets
 *       422 { error: { code: 'VALIDATION_ERROR', message, details: [{ location, path, message }] } }
 *     listing EVERY problem at once (not just the first), so the frontend can highlight all fields.
 */
import { ValidationError } from '../utils/AppError.js';

// The parts of a request we can validate:
//   params = URL path parameters, e.g. :id in /habits/:id
//   query  = the ?key=value part of the URL
//   body   = the parsed JSON body
const LOCATIONS = ['params', 'query', 'body'];

/**
 * @param {{ body?: import('zod').ZodType, params?: import('zod').ZodType, query?: import('zod').ZodType }} schemas
 *   one Zod schema per request part you want checked; omit the parts you don't need
 * @returns {import('express').RequestHandler} Express middleware
 */
export function validate(schemas) {
  // validate() is a "middleware factory": it receives the schemas once (when routes are set
  // up) and returns the actual middleware function that runs on every request.
  return function validateRequest(req, res, next) {
    const parsed = {};
    const details = [];

    for (const location of LOCATIONS) {
      const schema = schemas[location];
      if (!schema) continue;

      // safeParse never throws; it returns { success, data } or { success, error }.
      const result = schema.safeParse(req[location]);
      if (result.success) {
        parsed[location] = result.data;
      } else {
        // Collect every issue, e.g. { location: 'body', path: 'name', message: 'Too small...' }.
        // Zod paths are arrays (['items', 0, 'name']); we join them into 'items.0.name'.
        for (const issue of result.error.issues) {
          details.push({
            location,
            path: issue.path.map(String).join('.'),
            message: issue.message,
          });
        }
      }
    }

    if (details.length > 0) {
      // Passing an error to next() skips the remaining middleware/controller and jumps
      // straight to the error handler, which sends the 422 response.
      next(new ValidationError('Request validation failed', { details }));
      return;
    }

    // Everything valid: swap the raw values for the clean, parsed ones.
    if ('body' in parsed) req.body = parsed.body;
    if ('params' in parsed) req.params = parsed.params;
    if ('query' in parsed) {
      // In Express 5, req.query is a read-only getter, so `req.query = ...` would throw.
      // Object.defineProperty replaces it with a normal property holding our parsed value.
      Object.defineProperty(req, 'query', {
        value: parsed.query,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }
    next(); // continue to the next middleware / controller
  };
}
