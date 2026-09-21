import { query, queryOne, type Tx } from '../db/pool.ts';
import { BusinessRuleError, NotFoundError } from '../core/errors.ts';
import { recordAudit } from '../core/audit.ts';
import {
  assertKnownBillingCode,
  calculateHourly,
  calculateMilestone,
  sumLineItems,
  type LineItem,
} from './billing.ts';

/**
 * Invoice creation, shared by the invoice routes and by milestone approval.
 *
 * Both paths funnel through here so an invoice is built the same way whoever
 * asked for it — the milestone flow is not allowed a shortcut that skips the
 * checks the manual flow performs.
 */

export const invoiceColumns = `
  i.id, i.contract_id AS "contractId", c.title AS "contractTitle",
  i.period_start AS "periodStart", i.period_end AS "periodEnd",
  i.total_amount AS "totalAmount", i.status, i.approved_at AS "approvedAt",
  i.milestone_id AS "milestoneId",
  i.audit_override_reason AS "auditOverrideReason"`;

export const invoiceFrom = `FROM invoices i JOIN contracts c ON c.id = i.contract_id`;

/** Attaches line items to a set of invoices in one query rather than N. */
export async function withLineItems<T extends { id: string }>(invoices: T[]) {
  if (invoices.length === 0) return [];
  const items = await query<{ invoice_id: string }>(
    `SELECT invoice_id, id, description, quantity, unit_rate AS "unitRate", amount
       FROM invoice_line_items WHERE invoice_id = ANY($1::uuid[]) ORDER BY description`,
    [`{${invoices.map((i) => i.id).join(',')}}`],
  );
  const byInvoice = new Map<string, unknown[]>();
  for (const row of items) {
    const { invoice_id: invoiceId, ...item } = row;
    if (!byInvoice.has(invoiceId)) byInvoice.set(invoiceId, []);
    byInvoice.get(invoiceId)!.push(item);
  }
  return invoices.map((i) => ({ ...i, lineItems: byInvoice.get(i.id) ?? [] }));
}

async function persistInvoice(
  tx: Tx,
  input: {
    contractId: string;
    periodStart: string;
    periodEnd: string;
    lineItems: LineItem[];
    generatedBy: string;
    milestoneId?: string | null;
  },
): Promise<string> {
  const total = sumLineItems(input.lineItems);

  const invoice = await tx.queryOne<{ id: string }>(
    `INSERT INTO invoices
       (contract_id, period_start, period_end, total_amount, status, generated_by, milestone_id)
     VALUES ($1, $2, $3, $4, 'DRAFT', $5, $6) RETURNING id`,
    [
      input.contractId,
      input.periodStart,
      input.periodEnd,
      total,
      input.generatedBy,
      input.milestoneId ?? null,
    ],
  );

  for (const item of input.lineItems) {
    await tx.query(
      `INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_rate, amount)
       VALUES ($1, $2, $3, $4, $5)`,
      [invoice!.id, item.description, item.quantity, item.unitRate, item.amount],
    );
  }
  return invoice!.id;
}

/** Generates a draft hourly invoice for a contract and billing period. */
export async function generateHourlyInvoice(
  tx: Tx,
  input: { contractId: string; periodStart: string; periodEnd: string; actorId: string },
): Promise<string> {
  if (input.periodEnd < input.periodStart) {
    throw new BusinessRuleError(
      `Billing period ends (${input.periodEnd}) before it starts (${input.periodStart})`,
    );
  }

  const contract = await tx.queryOne<{ id: string; title: string; billing_code: string }>(
    `SELECT c.id, c.title, bt.code AS billing_code
       FROM contracts c JOIN billing_types bt ON bt.id = c.billing_type_id
      WHERE c.id = $1`,
    [input.contractId],
  );
  if (!contract) throw new NotFoundError('Contract', input.contractId);
  assertKnownBillingCode(contract.billing_code);

  const duplicate = await tx.queryOne(
    `SELECT 1 FROM invoices WHERE contract_id = $1 AND period_start = $2 AND period_end = $3`,
    [input.contractId, input.periodStart, input.periodEnd],
  );
  if (duplicate) {
    throw new BusinessRuleError(
      `An invoice already exists for "${contract.title}" covering ` +
        `${input.periodStart} to ${input.periodEnd}`,
    );
  }

  const lineItems = await calculateHourly({
    tx,
    contractId: input.contractId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  });
  if (lineItems.length === 0) {
    throw new BusinessRuleError(
      `No approved work exists for "${contract.title}" between ${input.periodStart} and ` +
        `${input.periodEnd}. Approve the relevant timesheets first.`,
    );
  }

  const id = await persistInvoice(tx, {
    contractId: input.contractId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    lineItems,
    generatedBy: input.actorId,
  });

  await recordAudit(
    {
      userId: input.actorId,
      action: 'GENERATE_INVOICE',
      entityType: 'Invoice',
      entityId: id,
      newValue: { ...input, lineItems, total: sumLineItems(lineItems) },
    },
    tx,
  );
  return id;
}

/**
 * Generates the fixed-amount invoice for an approved milestone.
 *
 * Dated on the day it is raised, which is routinely after the contract term
 * ends — the milestone, not the period, is what authorises it.
 */
export async function generateMilestoneInvoice(
  tx: Tx,
  input: { milestoneId: string; actorId: string },
): Promise<string> {
  const milestone = await tx.queryOne<{
    id: string;
    contract_id: string;
    label: string;
    amount: string;
    status: string;
  }>(
    'SELECT id, contract_id, label, amount, status FROM contract_milestones WHERE id = $1',
    [input.milestoneId],
  );
  if (!milestone) throw new NotFoundError('Milestone', input.milestoneId);

  const alreadyBilled = await tx.queryOne('SELECT 1 FROM invoices WHERE milestone_id = $1', [
    input.milestoneId,
  ]);
  if (alreadyBilled) {
    throw new BusinessRuleError(`"${milestone.label}" has already been invoiced`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const id = await persistInvoice(tx, {
    contractId: milestone.contract_id,
    periodStart: today,
    periodEnd: today,
    lineItems: calculateMilestone(milestone.label, milestone.amount),
    generatedBy: input.actorId,
    milestoneId: milestone.id,
  });

  await recordAudit(
    {
      userId: input.actorId,
      action: 'GENERATE_MILESTONE_INVOICE',
      entityType: 'Invoice',
      entityId: id,
      newValue: { milestoneId: milestone.id, label: milestone.label, amount: milestone.amount },
    },
    tx,
  );
  return id;
}

/** One invoice with its line items, or null. */
export async function findInvoice(id: string) {
  const invoice = await queryOne(`SELECT ${invoiceColumns} ${invoiceFrom} WHERE i.id = $1`, [id]);
  if (!invoice) return null;
  const [withItems] = await withLineItems([invoice as { id: string }]);
  return withItems;
}
