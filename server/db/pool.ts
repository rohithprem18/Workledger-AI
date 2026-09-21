import pg from 'pg';

const { Pool, types: pgTypes } = pg;

/**
 * Database access.
 *
 * Uses node-postgres rather than a provider-specific driver so the same code
 * runs against Neon in production, a plain PostgreSQL container in CI, and
 * whatever is on a developer's laptop. A driver that only speaks to one host
 * makes the test suite depend on the vendor.
 *
 * Serverless concurrency is handled by pointing `DATABASE_URL` at a pooled
 * endpoint — Neon's `-pooler` host runs PgBouncer, which is what keeps a burst
 * of Vercel invocations from exhausting the connection limit. The pool here is
 * deliberately tiny: each invocation is its own short-lived process, so holding
 * more than a couple of connections per instance just reserves slots that sit
 * idle.
 */

const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Point it at your PostgreSQL connection string (see .env.example).',
  );
}

/**
 * Keep DATE and TIME as the strings Postgres sends.
 *
 * The React client was written against an API where a date serialized as
 * "2026-04-01" and a time as "09:00:00". Left to the default parser these
 * become JS `Date` objects and JSON-serialize as full UTC timestamps, which
 * shifts a date across the day boundary for anyone west of UTC. TIMESTAMPTZ is
 * deliberately *not* overridden: it stays a `Date` and serializes to ISO-8601.
 *
 * NUMERIC also stays a string — pg's default, and it keeps money out of floats.
 */
const PG_DATE = 1082;
const PG_TIME = 1083;
const PG_TIMETZ = 1266;
const asIs = (value: string): string => value;

pgTypes.setTypeParser(PG_DATE, asIs);
pgTypes.setTypeParser(PG_TIME, asIs);
pgTypes.setTypeParser(PG_TIMETZ, asIs);

/**
 * Module scope, so a warm serverless instance reuses its connections instead
 * of reconnecting per request.
 */
const pool = new Pool({
  connectionString,
  max: Number(process.env.DB_POOL_MAX ?? 3),
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
  // Managed Postgres requires TLS but presents a certificate chain the default
  // verifier rejects; a local instance usually has no TLS at all.
  ssl: /\bsslmode=(require|prefer|verify)/.test(connectionString)
    ? { rejectUnauthorized: false }
    : undefined,
});

// An idle client erroring (a provider dropping the connection) must not take
// the process down with an unhandled 'error' event.
pool.on('error', (error) => {
  console.error('Idle database client error:', error.message);
});

export type QueryParam = string | number | boolean | Date | null | undefined;

/** A row shape is whatever the caller says it is; SQL is the source of truth. */
export type Row = Record<string, unknown>;

/**
 * Runs a parameterised query. Always use `$1`-style placeholders — string
 * interpolation into SQL is never acceptable, including for "safe-looking"
 * values like a UUID from a path parameter.
 */
export async function query<T extends Row = Row>(
  text: string,
  params: QueryParam[] = [],
): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

/** First row, or null. For lookups where absence is an ordinary outcome. */
export async function queryOne<T extends Row = Row>(
  text: string,
  params: QueryParam[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** A client scoped to one transaction. Mirrors the `query` signature. */
export interface Tx {
  query<T extends Row = Row>(text: string, params?: QueryParam[]): Promise<T[]>;
  queryOne<T extends Row = Row>(text: string, params?: QueryParam[]): Promise<T | null>;
}

/**
 * Runs `fn` inside a single transaction, committing on success and rolling
 * back on any thrown error.
 *
 * This is what makes the platform's invariants hold: assignment creation locks
 * an employee row and re-validates inside here, so two concurrent requests
 * cannot both pass validation against data that changed underneath them.
 */
export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool.connect();

  const tx: Tx = {
    async query<R extends Row = Row>(text: string, params: QueryParam[] = []) {
      const result = await client.query(text, params);
      return result.rows as R[];
    },
    async queryOne<R extends Row = Row>(text: string, params: QueryParam[] = []) {
      const result = await client.query(text, params);
      return (result.rows[0] as R | undefined) ?? null;
    },
  };

  try {
    await client.query('BEGIN');
    const out = await fn(tx);
    await client.query('COMMIT');
    return out;
  } catch (error) {
    // A rollback failure must not mask the error that caused it.
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Closes the pool. For scripts and tests; never called by a request path. */
export async function closePool(): Promise<void> {
  await pool.end();
}
