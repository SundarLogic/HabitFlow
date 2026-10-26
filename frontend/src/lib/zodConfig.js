/**
 * Zod settings, applied before any schema is created. main.jsx imports this file FIRST: ES
 * imports run before the importing file's own code, so configuring Zod inside main.jsx would be
 * too late for the schemas that App.jsx pulls in.
 *
 * jitless: Zod 4 normally probes `new Function` to speed up validation. The production
 * Content-Security-Policy (vercel.json) forbids eval, so each probe would be reported as a CSP
 * violation. jitless skips the probe; validation results are identical.
 */
import { z } from 'zod';

z.config({ jitless: true });
