import { createApp } from '../server/app.js';

/**
 * Vercel serverless entry point.
 *
 * A catch-all (`[...path]`) rather than a rewrite, because a rewrite rewrites
 * the URL the function sees — Express would then match every request against
 * the same path and route nothing. The catch-all preserves the original URL,
 * so `/api/invoices/:id/audit` arrives intact.
 *
 * The app is built once per warm instance: module scope survives between
 * invocations on the same container, so route assembly is not repeated per
 * request.
 */
const app = createApp();

export default app;
