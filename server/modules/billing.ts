import type { Tx } from '../db/pool.ts';
import { BusinessRuleError } from '../core/errors.ts';

/**
 * Invoice calculation, one strategy per billing model.
 *
 * `InvoiceService` picks a strategy by the contract's billing code and never
 * branches on it itself, so adding a model (retainer, fixed-fee, blended rate)
 * is a new entry in `STRATEGIES` rather than another `if` threaded through
 * invoice generation.
 *
 * Every amount here is computed from database rows. A total is never taken
 * from a request body.
 */

export interface LineItem {
  description: string;
  quantity: string;
  unitRate: string;
  amount: string;
}

export interface HourlyInput {
  tx: Tx;
  contractId: string;
  periodStart: string;
  periodEnd: string;
}

/** Money as a fixed-2 string throughout, so nothing becomes a float. */
function money(value: number): string {
  return value.toFixed(2);
}

export function sumLineItems(items: LineItem[]): string {
  return money(items.reduce((total, item) => total + Number(item.amount), 0));
}

/**
 * Hourly: approved work logs in the period, grouped by requirement, valued at
 * that requirement's authorised rate.
 *
 * Only APPROVED logs are considered. Submitted-but-unapproved work is not
 * billable, and the auditor separately reports that it was left out so the
 * period is not closed prematurely.
 */
export async function calculateHourly({
  tx,
  contractId,
  periodStart,
  periodEnd,
}: HourlyInput): Promise<LineItem[]> {
  const rows = await tx.query<{
    requirement_id: string;
    skill_name: string;
    hourly_rate: string;
    total_minutes: string;
  }>(
    `SELECT r.id AS requirement_id, s.name AS skill_name, r.hourly_rate,
            sum(w.total_actual_minutes) AS total_minutes
       FROM work_logs w
       JOIN assignments a ON a.id = w.assignment_id
       JOIN contract_requirements r ON r.id = a.requirement_id
       JOIN skills s ON s.id = r.skill_id
      WHERE r.contract_id = $1
        AND w.status = 'APPROVED'
        AND w.work_date >= $2 AND w.work_date <= $3
      GROUP BY r.id, s.name, r.hourly_rate
      ORDER BY s.name`,
    [contractId, periodStart, periodEnd],
  );

  return rows.map((row) => {
    const hours = Number(row.total_minutes) / 60;
    const rate = Number(row.hourly_rate);
    return {
      description: `Contracted Work [${row.skill_name}] — ${hours.toFixed(2)} hrs @ ${rate.toFixed(2)}`,
      quantity: hours.toFixed(2),
      unitRate: rate.toFixed(2),
      amount: money(hours * rate),
    };
  });
}

/** Milestone: one fixed-amount line for the milestone being billed. */
export function calculateMilestone(label: string, amount: string): LineItem[] {
  const value = Number(amount);
  return [
    {
      description: `Milestone: ${label}`,
      quantity: '1.00',
      unitRate: value.toFixed(2),
      amount: value.toFixed(2),
    },
  ];
}

export type BillingCode = 'HOURLY' | 'MILESTONE';

export function assertKnownBillingCode(code: string): asserts code is BillingCode {
  if (code !== 'HOURLY' && code !== 'MILESTONE') {
    throw new BusinessRuleError(
      `No invoice strategy is registered for billing type "${code}". ` +
        'Add one rather than special-casing it at the call site.',
    );
  }
}
