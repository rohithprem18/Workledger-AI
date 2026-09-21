import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodType } from 'zod';
import { AppError, ValidationError } from './errors.js';

/**
 * The response envelope every endpoint uses: `{ success, data, message }`.
 *
 * The React client unwraps `.data` in one place in its axios interceptor, so
 * this shape is a contract, not a convention — changing it silently breaks
 * every page at once.
 */
export interface Envelope<T> {
  success: boolean;
  data?: T;
  message?: string;
  timestamp: string;
}

export function ok<T>(res: Response, data: T, message?: string, status = 200): Response {
  const body: Envelope<T> = { success: true, data, timestamp: new Date().toISOString() };
  if (message) body.message = message;
  return res.status(status).json(body);
}

export function created<T>(res: Response, data: T, message?: string): Response {
  return ok(res, data, message, 201);
}

/**
 * Wraps an async handler so a rejected promise reaches Express' error
 * middleware. Without this, an await that throws becomes an unhandled rejection
 * and the request hangs until it times out.
 */
export function handler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/**
 * Reads a path parameter as a string.
 *
 * Express 5 types `req.params` values as `string | string[]`, because a
 * wildcard segment can repeat. None of this API's routes use one, so a value
 * arriving as an array means the route pattern and this call have diverged —
 * which is a bug worth surfacing rather than coercing past.
 */
export function param(req: Request, name: string): string {
  const value = (req.params as Record<string, string | string[] | undefined>)[name];
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  throw new ValidationError(`Missing path parameter: ${name}`);
}

/** Parses and types a request body, turning Zod issues into a 400. */
export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      const first = error.issues[0];
      const where = first?.path.length ? `${first.path.join('.')}: ` : '';
      throw new ValidationError(`${where}${first?.message ?? 'Invalid request body'}`, error.issues);
    }
    throw error;
  }
}

/** Same, for query strings. */
export function parseQuery<T>(schema: ZodType<T>, query: unknown): T {
  return parseBody(schema, query);
}

/** Terminal error handler. Registered last, after every route. */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof AppError) {
    res.status(error.status).json({
      success: false,
      message: error.message,
      code: error.code,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Anything else is a defect. Log it whole; tell the caller nothing specific.
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    message: 'An unexpected error occurred',
    code: 'INTERNAL_ERROR',
    timestamp: new Date().toISOString(),
  });
}

/** 404 for unmatched API routes, so they do not fall through to the SPA. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    message: `No such endpoint: ${req.method} ${req.path}`,
    code: 'NOT_FOUND',
    timestamp: new Date().toISOString(),
  });
}
