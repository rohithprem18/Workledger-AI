import { query, type Tx } from '../db/pool.ts';

/**
 * Writes the audit trail.
 *
 * The Java version did this with an AOP aspect around an `@Auditable`
 * annotation, which TypeScript has no equivalent of without decorators and a
 * DI container. So it is an explicit call — less magical, and the trade is
 * visible: an aspect could not be forgotten, whereas this can. The mitigation
 * is that every write path that matters goes through a service function, and
 * each one calls this as its last step inside the same transaction.
 *
 * Audit writes must never fail the business operation they describe. When one
 * is passed a transaction it shares that transaction (so a rolled-back action
 * leaves no audit row claiming it happened); outside a transaction, a failure
 * is logged and swallowed.
 */
export interface AuditEntry {
  userId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
}

const SQL = `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value)
             VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`;

function serialize(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ unserializable: String(value) });
  }
}

export async function recordAudit(entry: AuditEntry, tx?: Tx): Promise<void> {
  const params = [
    entry.userId,
    entry.action,
    entry.entityType,
    entry.entityId ?? null,
    serialize(entry.oldValue),
    serialize(entry.newValue),
  ];

  if (tx) {
    // Inside a transaction, let a failure roll the whole thing back: an action
    // that cannot be audited should not be recorded as having happened.
    await tx.query(SQL, params);
    return;
  }

  try {
    await query(SQL, params);
  } catch (error) {
    console.error('Failed to write audit entry', entry.action, error);
  }
}
