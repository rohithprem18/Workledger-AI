import type { Tx } from '../db/pool.js';

/**
 * The three authoritative sources, materialized once and handed to every rule.
 *
 *   1. Contract      — requirements, their authorised rates, and the term
 *   2. Approved work — approved work logs in the period, and the milestone
 *                      behind a milestone invoice
 *   3. Invoice       — the line items exactly as presented for payment
 *
 * Loading once matters: if rules each queried independently they could
 * disagree about what the data said, and a reconciliation that contradicts
 * itself is worse than none.
 */

export type InvoiceRow = {
  id: string;
  contract_id: string;
  period_start: string;
  period_end: string;
  total_amount: string;
  status: string;
  milestone_id: string | null;
}

export type LineItemRow = {
  id: string;
  description: string;
  quantity: string;
  unit_rate: string;
  amount: string;
}

export type ContractRow = {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  active: boolean;
  billing_code: string;
}

export type RequirementRow = {
  id: string;
  hourly_rate: string;
  skill_name: string;
}

export type WorkLogRow = {
  id: string;
  requirement_id: string;
  work_date: string;
  status: string;
  total_actual_minutes: number;
}

export type MilestoneRow = {
  id: string;
  label: string;
  amount: string;
  status: string;
  approved_at: string | null;
  total_tasks: number;
  incomplete_tasks: number;
}

export type OtherInvoiceRow = {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  milestone_id: string | null;
}

export interface ReconciliationContext {
  invoice: InvoiceRow;
  lineItems: LineItemRow[];
  contract: ContractRow;
  requirements: RequirementRow[];
  approvedLogs: WorkLogRow[];
  /** Draft/submitted/rejected logs in the same period. Billing them is a finding. */
  unapprovedLogs: WorkLogRow[];
  milestone: MilestoneRow | null;
  otherInvoices: OtherInvoiceRow[];
}

export const round2 = (value: number): number => Math.round(value * 100) / 100;

export function isMilestoneInvoice(ctx: ReconciliationContext): boolean {
  return ctx.invoice.milestone_id !== null;
}

/** Every distinct rate the contract authorises. */
export function authorisedRates(ctx: ReconciliationContext): number[] {
  return [...new Set(ctx.requirements.map((r) => Number(r.hourly_rate)))];
}

/** Total approved hours across the period. */
export function totalApprovedHours(ctx: ReconciliationContext): number {
  const minutes = ctx.approvedLogs.reduce((sum, l) => sum + Number(l.total_actual_minutes), 0);
  return round2(minutes / 60);
}

/** Source 2 valued at contracted rates: what approved work is actually worth. */
export function approvedWorkValue(ctx: ReconciliationContext): number {
  const rateByRequirement = new Map(
    ctx.requirements.map((r) => [r.id, Number(r.hourly_rate)]),
  );
  const minutesByRequirement = new Map<string, number>();

  for (const log of ctx.approvedLogs) {
    minutesByRequirement.set(
      log.requirement_id,
      (minutesByRequirement.get(log.requirement_id) ?? 0) + Number(log.total_actual_minutes),
    );
  }

  let total = 0;
  for (const [requirementId, minutes] of minutesByRequirement) {
    total += (minutes / 60) * (rateByRequirement.get(requirementId) ?? 0);
  }
  return round2(total);
}

/** Source 3: the invoice total as presented. */
export function invoicedTotal(ctx: ReconciliationContext): number {
  return round2(Number(ctx.invoice.total_amount ?? 0));
}

/**
 * Source 1: what the contract authorises for this invoice.
 *
 * For a milestone invoice that is the milestone amount; for an hourly invoice
 * the contract caps nothing directly, so approved work at contracted rates is
 * the bound.
 */
export function contractAuthorisedTotal(ctx: ReconciliationContext): number {
  return ctx.milestone ? round2(Number(ctx.milestone.amount)) : approvedWorkValue(ctx);
}

/** Loads all three sources in one place. */
export async function buildContext(tx: Tx, invoiceId: string): Promise<ReconciliationContext | null> {
  const invoice = await tx.queryOne<InvoiceRow>(
    `SELECT id, contract_id, period_start, period_end, total_amount, status, milestone_id
       FROM invoices WHERE id = $1`,
    [invoiceId],
  );
  if (!invoice) return null;

  const contract = await tx.queryOne<ContractRow>(
    `SELECT c.id, c.title, c.start_date, c.end_date, c.active, bt.code AS billing_code
       FROM contracts c JOIN billing_types bt ON bt.id = c.billing_type_id
      WHERE c.id = $1`,
    [invoice.contract_id],
  );
  if (!contract) return null;

  const [lineItems, requirements, logs, otherInvoices] = await Promise.all([
    tx.query<LineItemRow>(
      `SELECT id, description, quantity, unit_rate, amount
         FROM invoice_line_items WHERE invoice_id = $1 ORDER BY description`,
      [invoiceId],
    ),
    tx.query<RequirementRow>(
      `SELECT r.id, r.hourly_rate, s.name AS skill_name
         FROM contract_requirements r JOIN skills s ON s.id = r.skill_id
        WHERE r.contract_id = $1`,
      [invoice.contract_id],
    ),
    tx.query<WorkLogRow>(
      `SELECT w.id, a.requirement_id, w.work_date, w.status, w.total_actual_minutes
         FROM work_logs w
         JOIN assignments a ON a.id = w.assignment_id
         JOIN contract_requirements r ON r.id = a.requirement_id
        WHERE r.contract_id = $1 AND w.work_date >= $2 AND w.work_date <= $3`,
      [invoice.contract_id, invoice.period_start, invoice.period_end],
    ),
    tx.query<OtherInvoiceRow>(
      `SELECT id, period_start, period_end, status, milestone_id
         FROM invoices WHERE contract_id = $1 AND id <> $2`,
      [invoice.contract_id, invoiceId],
    ),
  ]);

  let milestone: MilestoneRow | null = null;
  if (invoice.milestone_id) {
    milestone = await tx.queryOne<MilestoneRow>(
      `SELECT m.id, m.label, m.amount, m.status, m.approved_at,
              count(t.id)::int AS total_tasks,
              count(t.id) FILTER (WHERE t.status <> 'DONE')::int AS incomplete_tasks
         FROM contract_milestones m
         LEFT JOIN milestone_tasks t ON t.milestone_id = m.id
        WHERE m.id = $1
        GROUP BY m.id`,
      [invoice.milestone_id],
    );
  }

  return {
    invoice,
    lineItems,
    contract,
    requirements,
    approvedLogs: logs.filter((l) => l.status === 'APPROVED'),
    unapprovedLogs: logs.filter((l) => l.status !== 'APPROVED'),
    milestone,
    otherInvoices,
  };
}
