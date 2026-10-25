/**
 * Client-side validation for the auth forms. It mirrors the backend rules (CLAUDE.md §3.1) so
 * users get instant feedback; the server still validates everything and its errors are shown too.
 */
import { z } from 'zod';

const email = z
  .string()
  .trim()
  .min(1, 'Enter your email address')
  .pipe(z.email({ message: 'Enter a valid email address, like name@example.com' }));

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password'),
});

export const signupSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(100, 'Use at most 100 characters'),
  email,
  password: z
    .string()
    .min(8, 'Use at least 8 characters')
    .max(128, 'Use at most 128 characters')
    .regex(/\p{L}/u, 'Include at least one letter')
    .regex(/\p{N}/u, 'Include at least one number'),
  timezone: z.string().min(1, 'Choose your timezone'),
});

/**
 * A rough password strength for the hint under the field. Guidance only: the real rule is the
 * schema above (and the server).
 * @param {string} password
 * @returns {{ score: 0|1|2|3|4, label: string, checks: { label: string, met: boolean }[] }}
 */
export function passwordStrength(password = '') {
  const checks = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'A letter', met: /\p{L}/u.test(password) },
    { label: 'A number', met: /\p{N}/u.test(password) },
  ];
  const met = checks.filter((c) => c.met).length; // 0..3
  // Meeting the rules is "Good"; length is what really makes a password strong.
  const score = met === 3 && password.length >= 12 ? 4 : met;
  const label = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'][score];
  return { score, label, checks };
}
