import express, { type Express } from 'express';
import { errorHandler, handler, notFoundHandler, ok } from './core/http.js';
import { query } from './db/pool.js';
import { isAiEnabled } from './ai/llm.js';
import { authRouter } from './auth/routes.js';
import { referenceRouter } from './modules/reference.routes.js';
import { rbacRouter } from './modules/rbac.routes.js';
import { employeeRouter } from './modules/employees.routes.js';
import { contractRouter } from './modules/contracts.routes.js';
import { assignmentRouter } from './modules/assignments.routes.js';
import { worklogRouter } from './modules/worklogs.routes.js';
import { milestoneRouter } from './modules/milestones.routes.js';
import { invoiceRouter } from './modules/invoices.routes.js';
import { intelligenceRouter } from './intelligence/routes.js';

/**
 * Assembles the API.
 *
 * Every route lives under `/api`, matching what the React client was built
 * against — the client's axios base URL and its `{success, data}` unwrapping
 * are a contract, so paths and response shapes here are not free to drift.
 */
export function createApp(): Express {
  const app = express();

  // Behind Vercel's proxy, so `req.ip` is the client rather than the edge.
  app.set('trust proxy', true);
  app.disable('x-powered-by');

  app.use(cors);

  // The upload endpoint needs raw bytes: decoding a PDF as text corrupts it.
  app.use('/api/contract-documents', express.raw({ type: 'multipart/form-data', limit: '12mb' }));
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', handler(healthCheck));

  app.use('/api/auth', authRouter);
  app.use('/api', referenceRouter);
  app.use('/api', rbacRouter);
  app.use('/api', employeeRouter);
  app.use('/api', contractRouter);
  app.use('/api', assignmentRouter);
  app.use('/api', worklogRouter);
  app.use('/api', milestoneRouter);
  app.use('/api', invoiceRouter);
  app.use('/api', intelligenceRouter);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}

/**
 * CORS.
 *
 * Same-origin in the normal deployment — the SPA and the API share a Vercel
 * domain — so this only matters when a frontend is hosted separately. The
 * allow-list is explicit; a wildcard is never emitted.
 */
const cors: express.RequestHandler = (req, res, next) => {
  const allowed = (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const origin = req.headers.origin;

  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
    res.setHeader('Access-Control-Max-Age', '3600');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
};

/**
 * Liveness probe.
 *
 * Unauthenticated on purpose: a health check that needs a token reports
 * "unhealthy" exactly when authentication breaks, which is when you most need
 * the platform to keep the deployment alive so you can look at it. It touches
 * the database, because an API that cannot reach its database is not serving
 * traffic in any sense that matters.
 */
async function healthCheck(_req: express.Request, res: express.Response) {
  let databaseUp = true;
  try {
    await query('SELECT 1');
  } catch {
    databaseUp = false;
  }

  const body = {
    service: 'workledger-ai',
    status: databaseUp ? 'UP' : 'DEGRADED',
    database: databaseUp ? 'UP' : 'DOWN',
    aiAssist: isAiEnabled() ? 'enabled' : 'deterministic-only',
  };
  return ok(res, body, undefined, databaseUp ? 200 : 503);
}
