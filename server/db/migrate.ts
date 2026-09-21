import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/**
 * Applies the versioned SQL migrations in `./migrations`, in order, exactly once.
 *
 * Deliberately a one-off script rather than something that runs on boot: in a
 * serverless runtime every request could otherwise race to migrate, and a
 * schema change would be attempted by dozens of concurrent invocations. Run it
 * from CI or by hand (`npm run migrate`) before the new code goes live.
 *
 * Semantics match the Flyway setup this replaced, so the same SQL files keep
 * working unchanged:
 *   - each file is applied once, tracked in `schema_migrations`
 *   - files apply in numeric version order, not lexicographic
 *   - each file runs inside its own transaction, so a failure leaves no
 *     half-applied migration behind
 *   - a checksum mismatch on an already-applied file is a hard error, because
 *     editing applied SQL means the database and the repository have diverged
 */

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, 'migrations');

interface Migration {
  version: number;
  name: string;
  file: string;
  sql: string;
  checksum: string;
}

export function loadMigrations(dir = migrationsDir): Migration[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((file) => {
      const match = /^V(\d+)__(.+)\.sql$/.exec(file);
      if (!match) {
        throw new Error(`Migration filename must look like V1__description.sql, got: ${file}`);
      }
      const sql = readFileSync(join(dir, file), 'utf8');
      return {
        version: Number(match[1]),
        name: match[2]!.replace(/_/g, ' '),
        file,
        sql,
        checksum: createHash('sha256').update(sql).digest('hex'),
      };
    })
    // Numeric, so V10 lands after V9 rather than after V1.
    .sort((a, b) => a.version - b.version);
}

export async function migrate(connectionString: string): Promise<void> {
  const pool = new pg.Pool({
    connectionString,
    ssl: /sslmode=(require|prefer|verify)/.test(connectionString)
      ? { rejectUnauthorized: false }
      : undefined,
  });
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     INT PRIMARY KEY,
        name        TEXT        NOT NULL,
        checksum    VARCHAR(64) NOT NULL,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const { rows: applied } = await client.query<{
      version: number;
      checksum: string;
      name: string;
    }>('SELECT version, checksum, name FROM schema_migrations');
    const appliedByVersion = new Map(applied.map((r) => [Number(r.version), r]));

    const migrations = loadMigrations();
    let ran = 0;

    for (const m of migrations) {
      const already = appliedByVersion.get(m.version);

      if (already) {
        if (already.checksum !== m.checksum) {
          throw new Error(
            `Migration V${m.version} (${m.file}) has changed since it was applied.\n` +
              'An applied migration is history and must not be edited — the database ' +
              'already has the old version. Add a new migration instead.',
          );
        }
        continue;
      }

      process.stdout.write(`  V${m.version}  ${m.name} ... `);
      try {
        await client.query('BEGIN');
        await client.query(m.sql);
        await client.query(
          'INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
          [m.version, m.name, m.checksum],
        );
        await client.query('COMMIT');
        ran++;
        process.stdout.write('ok\n');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        process.stdout.write('FAILED\n');
        throw error;
      }
    }

    console.log(
      ran === 0
        ? `Schema is up to date (${migrations.length} migration(s) already applied).`
        : `Applied ${ran} migration(s); schema is now at V${migrations.at(-1)?.version}.`,
    );
  } finally {
    client.release();
    await pool.end();
  }
}

// Only self-execute when run directly, so tests can import the loader.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }
  migrate(connectionString).catch((error: unknown) => {
    console.error('\nMigration failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
