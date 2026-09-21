import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMigrations } from './migrate.ts';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

describe('migration loading', () => {
  const migrations = loadMigrations(migrationsDir);

  it('finds every migration', () => {
    expect(migrations.length).toBeGreaterThanOrEqual(11);
  });

  it('orders numerically, not lexicographically', () => {
    // The bug this guards: sorting by filename puts V10 between V1 and V2,
    // which applies the invoice-audit schema before the tables it references.
    const versions = migrations.map((m) => m.version);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(versions.indexOf(10)).toBeGreaterThan(versions.indexOf(9));
  });

  it('assigns each migration a unique version', () => {
    const versions = migrations.map((m) => m.version);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('checksums content, so an edited migration is detectable', () => {
    for (const migration of migrations) {
      expect(migration.checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(migration.sql.length).toBeGreaterThan(0);
    }
  });
});
