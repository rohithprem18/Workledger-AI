import {
  approvedWorkValue,
  authorisedRates,
  contractAuthorisedTotal,
  invoicedTotal,
  isMilestoneInvoice,
  round2,
  totalApprovedHours,
  type ReconciliationContext,
} from './context.ts';

/**
 * The reconciliation rules.
 *
 * Every rule is a pure function of the context: no database, no clock, no
 * model. That is what makes the auditor deterministic — the same invoice and
 * the same data always yield the same verdict, and a disputed invoice can be
 * re-audited to the same answer months later.
 *
 * Adding a check means adding a function to `RULES`. Nothing else changes.
 */

export type Severity = 'BLOCKER' | 'WARNING' | 'INFO';
export type Verdict = 'CLEAN' | 'ADVISORY' | 'BLOCKED';

export interface Finding {
  ruleCode: string;
  severity: Severity;
  title: string;
  /** Deterministic, numeric statement of the discrepancy. Always present. */
  detail: string;
  expectedValue?: string | null;
  actualValue?: string | null;
  delta?: number | null;
  lineItemId?: string | null;
}

export interface Rule {
  code: string;
  evaluate(ctx: ReconciliationContext): Finding[];
}

/** Rounding at two decimal places can legitimately shift a line by a cent. */
const CENT = 0.01;
const HOUR_TOLERANCE = 0.02;

const money = (n: number): string => n.toFixed(2);

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

// ------------------------------------------------------------- arithmetic

/**
 * The invoice adds up: every line is quantity × rate, and the total is the sum
 * of the lines. The cheapest check and the one worth running first — an
 * invoice whose own arithmetic is wrong cannot be compared to anything else.
 */
const lineItemArithmetic: Rule = {
  code: 'LINE_ITEM_ARITHMETIC',
  evaluate(ctx) {
    const findings: Finding[] = [];

    if (ctx.lineItems.length === 0) {
      return [
        {
          ruleCode: this.code,
          severity: 'BLOCKER',
          title: 'Invoice has no line items',
          detail:
            `This invoice presents a total of ${money(invoicedTotal(ctx))} with nothing ` +
            'itemised to support it. An invoice must break down into explainable parts ' +
            'before it can be approved.',
        },
      ];
    }

    let sum = 0;
    for (const item of ctx.lineItems) {
      const expected = round2(Number(item.quantity) * Number(item.unit_rate));
      const actual = round2(Number(item.amount));
      sum = round2(sum + actual);

      const difference = round2(actual - expected);
      if (Math.abs(difference) > CENT) {
        findings.push({
          ruleCode: this.code,
          severity: 'BLOCKER',
          title: 'Line item does not equal quantity × rate',
          detail:
            `"${item.description}" bills ${money(actual)} but ${item.quantity} × ` +
            `${item.unit_rate} is ${money(expected)}, a difference of ${money(difference)}.`,
          expectedValue: money(expected),
          actualValue: money(actual),
          delta: difference,
          lineItemId: item.id,
        });
      }
    }

    const total = invoicedTotal(ctx);
    const totalDifference = round2(total - sum);
    if (Math.abs(totalDifference) > CENT) {
      findings.push({
        ruleCode: this.code,
        severity: 'BLOCKER',
        title: 'Invoice total does not match its line items',
        detail:
          `The invoice total is ${money(total)} but its ${ctx.lineItems.length} line item(s) ` +
          `sum to ${money(sum)}, a difference of ${money(totalDifference)}.`,
        expectedValue: money(sum),
        actualValue: money(total),
        delta: totalDifference,
      });
    }
    return findings;
  },
};

// ------------------------------------------------------ rate authorisation

/**
 * Reconciles source 3 against source 1: every unit rate billed must be one the
 * contract authorises.
 *
 * An unauthorised rate costs the most and is hardest to spot by eye, because
 * the invoice is internally consistent — the arithmetic is right, the hours are
 * right, and only the price is wrong.
 */
const rateAuthorisation: Rule = {
  code: 'RATE_NOT_AUTHORISED',
  evaluate(ctx) {
    // A milestone invoice bills a fixed amount, not a rate.
    if (isMilestoneInvoice(ctx)) return [];

    const authorised = authorisedRates(ctx);
    if (authorised.length === 0) {
      return [
        {
          ruleCode: this.code,
          severity: 'BLOCKER',
          title: 'Contract authorises no rates',
          detail:
            'This contract has no requirements, so no hourly rate on it is authorised, ' +
            'yet an invoice has been raised against it.',
        },
      ];
    }

    const findings: Finding[] = [];
    for (const item of ctx.lineItems) {
      const billed = Number(item.unit_rate);
      if (authorised.some((rate) => Math.abs(rate - billed) < CENT)) continue;

      const nearest = authorised.reduce((best, rate) =>
        Math.abs(rate - billed) < Math.abs(best - billed) ? rate : best,
      );
      findings.push({
        ruleCode: this.code,
        severity: 'BLOCKER',
        title: 'Billed rate is not authorised by the contract',
        detail:
          `"${item.description}" is billed at ${money(billed)} per unit. The contract ` +
          `authorises ${authorised.map(money).join(', ')}. The closest authorised rate ` +
          `is ${money(nearest)}.`,
        expectedValue: money(nearest),
        actualValue: money(billed),
        delta: round2(billed - nearest),
        lineItemId: item.id,
      });
    }
    return findings;
  },
};

// ------------------------------------------------- approved-work coverage

/**
 * Reconciles source 3 against source 2: the hours billed must be hours that
 * were actually worked and actually approved.
 *
 * This is the check the whole platform exists to make possible. Approved work
 * logs are immutable and rate-bearing, so "what may be billed" is a computed
 * fact rather than a claim — billing more than was approved is provable.
 */
const approvedWorkCoverage: Rule = {
  code: 'APPROVED_WORK_COVERAGE',
  evaluate(ctx) {
    if (isMilestoneInvoice(ctx)) return [];

    const findings: Finding[] = [];

    const billedHours = round2(
      ctx.lineItems.reduce((sum, item) => sum + Number(item.quantity), 0),
    );
    const approvedHours = totalApprovedHours(ctx);
    const hourDifference = round2(billedHours - approvedHours);

    if (hourDifference > HOUR_TOLERANCE) {
      findings.push({
        ruleCode: this.code,
        severity: 'BLOCKER',
        title: 'Invoice bills more hours than were approved',
        detail:
          `The invoice bills ${billedHours} hours for ${ctx.invoice.period_start} to ` +
          `${ctx.invoice.period_end}, but only ${approvedHours} hours are approved in that ` +
          `period — ${hourDifference} hours are billed without an approved work log behind them.`,
        expectedValue: String(approvedHours),
        actualValue: String(billedHours),
        delta: hourDifference,
      });
    } else if (-hourDifference > HOUR_TOLERANCE) {
      // Under-billing costs the vendor rather than the client, so it is
      // surfaced for a decision rather than blocking approval.
      findings.push({
        ruleCode: this.code,
        severity: 'WARNING',
        title: 'Approved hours are missing from this invoice',
        detail:
          `${approvedHours} hours are approved for this period but only ${billedHours} are ` +
          `billed. ${round2(-hourDifference)} approved hours are going unbilled.`,
        expectedValue: String(approvedHours),
        actualValue: String(billedHours),
        delta: hourDifference,
      });
    }

    const expectedValue = approvedWorkValue(ctx);
    const invoiced = invoicedTotal(ctx);
    const valueDifference = round2(invoiced - expectedValue);

    if (Math.abs(valueDifference) > 0.05) {
      findings.push({
        ruleCode: this.code,
        severity: valueDifference > 0 ? 'BLOCKER' : 'WARNING',
        title: 'Invoice total does not match approved work at contracted rates',
        detail:
          `Approved work in this period is worth ${money(expectedValue)} at contracted rates, ` +
          `but the invoice presents ${money(invoiced)} — a difference of ${money(valueDifference)}.`,
        expectedValue: money(expectedValue),
        actualValue: money(invoiced),
        delta: valueDifference,
      });
    }
    return findings;
  },
};

// ----------------------------------------------------------- period bounds

/**
 * Reconciles the invoice period against the contract's own dates. Billing
 * outside the term is unrecoverable if it reaches the client: there is no
 * agreement covering the work, so the line has no basis to be paid against.
 */
const contractPeriod: Rule = {
  code: 'PERIOD_OUTSIDE_CONTRACT',
  evaluate(ctx) {
    const findings: Finding[] = [];
    const { period_start: start, period_end: end } = ctx.invoice;

    if (end < start) {
      return [
        {
          ruleCode: this.code,
          severity: 'BLOCKER',
          title: 'Invoice period ends before it starts',
          detail: `The billing period runs from ${start} to ${end}, which is not a valid period.`,
        },
      ];
    }

    // A milestone invoice is dated the day it is raised, routinely after the
    // contract ends. Its authorisation comes from the milestone instead.
    if (isMilestoneInvoice(ctx)) return findings;

    if (start < ctx.contract.start_date) {
      const days = daysBetween(start, ctx.contract.start_date);
      findings.push({
        ruleCode: this.code,
        severity: 'BLOCKER',
        title: 'Invoice period starts before the contract does',
        detail:
          `The invoice bills from ${start}, but the contract only starts on ` +
          `${ctx.contract.start_date} — ${days} day(s) of the billing period are not ` +
          'covered by any agreement.',
        expectedValue: ctx.contract.start_date,
        actualValue: start,
        delta: days,
      });
    }

    if (end > ctx.contract.end_date) {
      const days = daysBetween(ctx.contract.end_date, end);
      findings.push({
        ruleCode: this.code,
        severity: 'BLOCKER',
        title: 'Invoice period extends past the contract end',
        detail:
          `The invoice bills through ${end}, but the contract ended on ` +
          `${ctx.contract.end_date} — ${days} day(s) of the billing period fall outside ` +
          'the contract term.',
        expectedValue: ctx.contract.end_date,
        actualValue: end,
        delta: days,
      });
    }

    if (!ctx.contract.active) {
      findings.push({
        ruleCode: this.code,
        severity: 'WARNING',
        title: 'Contract is marked inactive',
        detail: `This invoice is raised against "${ctx.contract.title}", which is no longer active.`,
      });
    }
    return findings;
  },
};

// ------------------------------------------------- milestone authorisation

/**
 * For milestone billing, source 2 is not a pile of hours but a single approved
 * checkpoint: the amount must match, and the milestone must genuinely have
 * been reached and signed off. An invoice for a milestone nobody approved is
 * the milestone equivalent of billing unapproved hours.
 */
const milestoneAuthorisation: Rule = {
  code: 'MILESTONE_AUTHORISATION',
  evaluate(ctx) {
    if (!isMilestoneInvoice(ctx)) return [];

    if (!ctx.milestone) {
      return [
        {
          ruleCode: this.code,
          severity: 'BLOCKER',
          title: 'Milestone behind this invoice is missing',
          detail:
            `This invoice references milestone ${ctx.invoice.milestone_id}, which no longer ` +
            'exists. Nothing authorises the amount billed.',
        },
      ];
    }

    const findings: Finding[] = [];
    const milestone = ctx.milestone;

    if (milestone.status === 'PENDING') {
      findings.push({
        ruleCode: this.code,
        severity: 'BLOCKER',
        title: 'Milestone has not been reached',
        detail:
          `"${milestone.label}" is still PENDING — it has not been marked reached by a ` +
          'manager, yet it has already been invoiced.',
        expectedValue: 'APPROVED_INVOICED',
        actualValue: milestone.status,
      });
    } else if (milestone.status === 'REACHED' && !milestone.approved_at) {
      findings.push({
        ruleCode: this.code,
        severity: 'BLOCKER',
        title: 'Milestone has not been approved by finance',
        detail:
          `"${milestone.label}" is marked reached but has no finance approval recorded, ` +
          'so the amount is not yet authorised for billing.',
        expectedValue: 'APPROVED_INVOICED',
        actualValue: milestone.status,
      });
    }

    const authorised = round2(Number(milestone.amount));
    const invoiced = invoicedTotal(ctx);
    const difference = round2(invoiced - authorised);

    if (Math.abs(difference) > CENT) {
      findings.push({
        ruleCode: this.code,
        severity: 'BLOCKER',
        title: 'Invoice amount does not match the milestone',
        detail:
          `Milestone "${milestone.label}" is worth ${money(authorised)} under the contract, ` +
          `but the invoice presents ${money(invoiced)} — a difference of ${money(difference)}.`,
        expectedValue: money(authorised),
        actualValue: money(invoiced),
        delta: difference,
      });
    }

    if (milestone.incomplete_tasks > 0) {
      findings.push({
        ruleCode: this.code,
        severity: 'WARNING',
        title: 'Milestone has unfinished tasks',
        detail:
          `${milestone.incomplete_tasks} of ${milestone.total_tasks} task(s) under ` +
          `"${milestone.label}" are not marked done, yet the milestone is being billed as complete.`,
        expectedValue: '0',
        actualValue: String(milestone.incomplete_tasks),
        delta: milestone.incomplete_tasks,
      });
    }
    return findings;
  },
};

// ------------------------------------------------------- duplicate billing

/**
 * Catches the same work being billed twice.
 *
 * Exact period duplicates are already refused at generation time, so what
 * reaches here is the harder case: a period that partially overlaps one
 * already invoiced. Those days sit on two invoices, and whichever is approved
 * second bills the client again for work already charged.
 */
const duplicateBilling: Rule = {
  code: 'OVERLAPPING_BILLING_PERIOD',
  evaluate(ctx) {
    if (isMilestoneInvoice(ctx)) {
      const duplicates = ctx.otherInvoices.filter(
        (other) => other.milestone_id === ctx.invoice.milestone_id,
      );
      if (duplicates.length === 0) return [];
      return [
        {
          ruleCode: this.code,
          severity: 'BLOCKER',
          title: 'Milestone has already been invoiced',
          detail:
            `Milestone ${ctx.invoice.milestone_id} is also billed by ${duplicates.length} ` +
            `other invoice(s): ${duplicates.map((d) => d.id.slice(0, 8)).join(', ')}. ` +
            'A milestone may only be billed once.',
          expectedValue: '1',
          actualValue: String(duplicates.length + 1),
          delta: duplicates.length,
        },
      ];
    }

    const findings: Finding[] = [];
    const { period_start: start, period_end: end } = ctx.invoice;

    for (const other of ctx.otherInvoices) {
      if (other.milestone_id) continue;

      const overlapStart = start > other.period_start ? start : other.period_start;
      const overlapEnd = end < other.period_end ? end : other.period_end;
      if (overlapStart > overlapEnd) continue;

      const days = daysBetween(overlapStart, overlapEnd) + 1;
      const approved = other.status === 'APPROVED';

      findings.push({
        ruleCode: this.code,
        severity: approved ? 'BLOCKER' : 'WARNING',
        title: approved
          ? 'Period overlaps an already-approved invoice'
          : 'Period overlaps another draft invoice',
        detail:
          `This invoice covers ${start} to ${end}, which overlaps invoice ` +
          `${other.id.slice(0, 8)} (${other.period_start} to ${other.period_end}, ` +
          `${other.status}) across ${overlapStart} to ${overlapEnd}. ` +
          (approved
            ? `Work in those ${days} day(s) has already been billed and paid for.`
            : `Approving both would bill those ${days} day(s) twice.`),
        expectedValue: '0',
        actualValue: String(days),
        delta: days,
      });
    }
    return findings;
  },
};

// --------------------------------------------------------- unapproved work

/**
 * Reports work in the period that never reached approval.
 *
 * Nothing here is wrong with the invoice — unapproved work is correctly
 * excluded. What this catches is an invoice raised too early: timesheets still
 * in a manager's queue mean the period is not closed, and approving now
 * guarantees a second invoice or a credit note later.
 */
const unapprovedWork: Rule = {
  code: 'UNAPPROVED_WORK_IN_PERIOD',
  evaluate(ctx) {
    if (isMilestoneInvoice(ctx) || ctx.unapprovedLogs.length === 0) return [];

    const findings: Finding[] = [];
    const hoursOf = (logs: typeof ctx.unapprovedLogs) =>
      round2(logs.reduce((sum, l) => sum + Number(l.total_actual_minutes), 0) / 60);

    const awaiting = ctx.unapprovedLogs.filter(
      (l) => l.status === 'SUBMITTED' || l.status === 'DRAFT',
    );
    if (awaiting.length > 0) {
      const hours = hoursOf(awaiting);
      findings.push({
        ruleCode: this.code,
        severity: 'WARNING',
        title: 'Work in this period is still awaiting approval',
        detail:
          `${awaiting.length} work log(s) totalling ${hours} hours fall inside ` +
          `${ctx.invoice.period_start} to ${ctx.invoice.period_end} but have not been ` +
          'approved, so they are not on this invoice. Approving now will require a ' +
          'follow-up invoice for them.',
        expectedValue: '0',
        actualValue: String(hours),
        delta: hours,
      });
    }

    const rejected = ctx.unapprovedLogs.filter((l) => l.status === 'REJECTED');
    if (rejected.length > 0) {
      const hours = hoursOf(rejected);
      findings.push({
        ruleCode: this.code,
        severity: 'INFO',
        title: 'Rejected work in this period was correctly excluded',
        detail:
          `${rejected.length} rejected work log(s) totalling ${hours} hours fall in this ` +
          'period and are not billed.',
        expectedValue: '0',
        actualValue: String(hours),
        delta: 0,
      });
    }
    return findings;
  },
};

export const RULES: Rule[] = [
  lineItemArithmetic,
  rateAuthorisation,
  approvedWorkCoverage,
  contractPeriod,
  milestoneAuthorisation,
  duplicateBilling,
  unapprovedWork,
];

/** Bump when rule behaviour changes, so an old verdict stays interpretable. */
export const RULES_VERSION = '1.0.0';

const SEVERITY_ORDER: Record<Severity, number> = { BLOCKER: 0, WARNING: 1, INFO: 2 };

export function verdictFor(findings: Finding[]): Verdict {
  if (findings.some((f) => f.severity === 'BLOCKER')) return 'BLOCKED';
  if (findings.some((f) => f.severity === 'WARNING')) return 'ADVISORY';
  return 'CLEAN';
}

/**
 * Runs every rule.
 *
 * All of them run even after a blocker: a reviewer who fixes one problem
 * should not then discover a second on the next run. A rule that throws is a
 * defect, but it must not suppress the findings of the others, so it is caught
 * and downgraded to a warning that says the invoice was not fully reconciled.
 */
export function evaluateAll(ctx: ReconciliationContext): Finding[] {
  const findings: Finding[] = [];

  for (const rule of RULES) {
    try {
      findings.push(...rule.evaluate(ctx));
    } catch (error) {
      console.error(`Reconciliation rule ${rule.code} failed:`, error);
      findings.push({
        ruleCode: rule.code,
        severity: 'WARNING',
        title: 'A reconciliation check could not complete',
        detail:
          `The ${rule.code} check failed to run against this invoice. This invoice has ` +
          'not been fully reconciled — resolve the error before relying on this verdict.',
      });
    }
  }

  // Blockers first, so the reason approval is refused is the first thing read.
  return findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

export { contractAuthorisedTotal, approvedWorkValue, invoicedTotal };
