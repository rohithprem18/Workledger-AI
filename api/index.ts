import { createApp } from '../server/app.js';

/**
 * Vercel serverless entry point.
 *
 * `vercel.json` rewrites every `/api/*` request to this one function. The
 * request keeps its original URL, so Express routes `/api/invoices/:id/audit`
 * exactly as it would on a normal server. (A `[...path]` catch-all filename is
 * not an alternative outside Next.js: there it matches only a single segment.)
 *
 * The app is built once per warm instance — module scope survives between
 * invocations on the same container, so route assembly is not repeated per
 * request.
 */
const app = createApp();

export default app;
