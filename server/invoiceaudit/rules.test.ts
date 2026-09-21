import { describe, expect, it } from 'vitest';
import type {
  ContractRow,
  InvoiceRow,
  LineItemRow,
  ReconciliationContext,
  WorkLogRow,
} from './context.ts';
import { evaluateAll, RULES, verdictFor, type Finding } from './rules.ts';

/**
 * The reconciliation rules are pure functions over the three sources, which is
 * what lets them be tested exactly like this — build the data, assert the
 * finding. No mocks, no database.
 *
 * Each case states a discrepancy an auditor would actually be asked to catch.
 */

const PERIOD_START = '2026-04-01';
const PERIOD_END = '2026-04-30';
const RATE = '1000.00';
const REQUIREMENT_ID = '11111111-1111-1111-1111-111111111111';

function contract(overrides: Partial<ContractRow> = {}): ContractRow {
  return {
    id: 'c1',
    title: 'Platform Engineering',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    active: true,
    billing_code: 'HOURLY',
    ...overrides,
  };
}

function line(overrides: Partial<LineItemRow> = {}): LineItemRow {
  return {
    id: 'li1',
    description: 'Engineering',
    quantity: '40.00',
    unit_rate: RATE,
    amount: '40000.00',
    ...overrides,
  };
}

function approvedLog(minutes: number): WorkLogRow {
  return {
    id: `w${minutes}`,
    requirement_id: REQUIREMENT_ID,
    work_date: PERIOD_START,
    status: 'APPROVED',
    total_actual_minutes: minutes,
  };
}

function ctx(overrides: Partial<ReconciliationContext> = {}): ReconciliationContext {
  const lineItems = overrides.lineItems ?? [line()];
  const total = lineItems.reduce((sum, i) => sum + Number(i.amount), 0).toFixed(2);

  const invoice: InvoiceRow = {
    id: 'i1',
    contract_id: 'c1',
    period_start: PERIOD_START,
    period_end: PERIOD_END,
    total_amount: total,
    status: 'DRAFT',
    milestone_id: null,
    ...overrides.invoice,
  };

  return {
    invoice,
    lineItems,
    contract: contract(),
    requirements: [{ id: REQUIREMENT_ID, hourly_rate: RATE, skill_name: 'Java' }],
    approvedLogs: [approvedLog(40 * 60)],
    unapprovedLogs: [],
    milestone: null,
    otherInvoices: [],
    ...overrides,
  };
}

const byRule = (findings: Finding[], code: string) => findings.filter((f) => f.ruleCode === code);
const blockers = (findings: Finding[]) => findings.filter((f) => f.severity === 'BLOCKER');

describe('a correct invoice', () => {
  it('reconciles clean against all three sources', () => {
    const findings = evaluateAll(ctx());
    expect(findings).toEqual([]);
    expect(verdictFor(findings)).toBe('CLEAN');
  });
});

describe('arithmetic', () => {
  it('blocks a line that does not equal quantity × rate', () => {
    // 40 hours at 1000 is 40,000 — this line claims 45,000.
    const findings = byRule(
      evaluateAll(ctx({ lineItems: [line({ amount: '45000.00' })] })),
      'LINE_ITEM_ARITHMETIC',
    );
    expect(blockers(findings)).toHaveLength(1);
    expect(findings[0]!.delta).toBe(5000);
  });

  it('blocks a total that does not match its line items', () => {
    const base = ctx({ lineItems: [line()] });
    const findings = byRule(
      evaluateAll({ ...base, invoice: { ...base.invoice, total_amount: '48000.00' } }),
      'LINE_ITEM_ARITHMETIC',
    );
    expect(findings.some((f) => f.title.includes('total'))).toBe(true);
  });

  it('blocks an invoice with no line items at all', () => {
    const findings = byRule(evaluateAll(ctx({ lineItems: [] })), 'LINE_ITEM_ARITHMETIC');
    expect(blockers(findings)).toHaveLength(1);
  });
});

describe('rate authorisation', () => {
  it('blocks a rate the contract never authorised', () => {
    // Billed at 1,200 against a contract authorising 1,000.
    const findings = byRule(
      evaluateAll(
        ctx({ lineItems: [line({ unit_rate: '1200.00', amount: '48000.00' })] }),
      ),
      'RATE_NOT_AUTHORISED',
    );
    expect(blockers(findings)).toHaveLength(1);
    expect(findings[0]!.delta).toBe(200);
  });

  it('blocks any invoice against a contract with no requirements', () => {
    const findings = byRule(evaluateAll(ctx({ requirements: [] })), 'RATE_NOT_AUTHORISED');
    expect(blockers(findings)).toHaveLength(1);
  });
});

describe('approved-work coverage', () => {
  it('blocks billing more hours than were approved', () => {
    // 20 hours approved, 40 billed.
    const findings = byRule(
      evaluateAll(ctx({ approvedLogs: [approvedLog(20 * 60)] })),
      'APPROVED_WORK_COVERAGE',
    );
    expect(blockers(findings).length).toBeGreaterThan(0);
  });

  it('only warns when approved hours go unbilled', () => {
    // Under-billing costs the vendor, not the client, so it is theirs to decide.
    const findings = byRule(
      evaluateAll(
        ctx({
          lineItems: [line({ quantity: '20.00', amount: '20000.00' })],
          approvedLogs: [approvedLog(40 * 60)],
        }),
      ),
      'APPROVED_WORK_COVERAGE',
    );
    expect(findings.length).toBeGreaterThan(0);
    expect(blockers(findings)).toHaveLength(0);
  });
});

describe('contract period', () => {
  it('blocks billing past the contract end', () => {
    const findings = byRule(
      evaluateAll(ctx({ contract: contract({ end_date: '2026-04-15' }) })),
      'PERIOD_OUTSIDE_CONTRACT',
    );
    expect(findings.some((f) => f.severity === 'BLOCKER' && f.title.includes('past'))).toBe(true);
  });

  it('warns when the contract is inactive', () => {
    const findings = byRule(
      evaluateAll(ctx({ contract: contract({ active: false }) })),
      'PERIOD_OUTSIDE_CONTRACT',
    );
    expect(findings.some((f) => f.severity === 'WARNING')).toBe(true);
  });
});

describe('duplicate billing', () => {
  it('blocks a period overlapping an already-approved invoice', () => {
    const findings = byRule(
      evaluateAll(
        ctx({
          otherInvoices: [
            {
              id: 'i0',
              period_start: '2026-04-15',
              period_end: '2026-05-15',
              status: 'APPROVED',
              milestone_id: null,
            },
          ],
        }),
      ),
      'OVERLAPPING_BILLING_PERIOD',
    );
    expect(blockers(findings)).toHaveLength(1);
    // 15 April through 30 April inclusive is 16 days.
    expect(findings[0]!.delta).toBe(16);
  });

  it('passes when periods do not overlap', () => {
    const findings = byRule(
      evaluateAll(
        ctx({
          otherInvoices: [
            {
              id: 'i0',
              period_start: '2026-03-01',
              period_end: '2026-03-31',
              status: 'APPROVED',
              milestone_id: null,
            },
          ],
        }),
      ),
      'OVERLAPPING_BILLING_PERIOD',
    );
    expect(findings).toEqual([]);
  });
});

describe('unapproved work', () => {
  it('warns that the period is not closed', () => {
    const findings = byRule(
      evaluateAll(
        ctx({
          unapprovedLogs: [{ ...approvedLog(8 * 60), id: 'w-pending', status: 'SUBMITTED' }],
        }),
      ),
      'UNAPPROVED_WORK_IN_PERIOD',
    );
    expect(findings.some((f) => f.severity === 'WARNING')).toBe(true);
    // Not a blocker: the invoice itself is correct, it is just early.
    expect(blockers(findings)).toHaveLength(0);
  });
});

describe('milestone authorisation', () => {
  const milestoneCtx = (status: string, approvedAt: string | null) =>
    ctx({
      invoice: {
        id: 'i1',
        contract_id: 'c1',
        period_start: PERIOD_START,
        period_end: PERIOD_START,
        total_amount: '450000.00',
        status: 'DRAFT',
        milestone_id: 'm1',
      },
      lineItems: [
        line({ description: 'Milestone: Discovery', quantity: '1.00', unit_rate: '450000.00', amount: '450000.00' }),
      ],
      milestone: {
        id: 'm1',
        label: 'Discovery',
        amount: '450000.00',
        status,
        approved_at: approvedAt,
        total_tasks: 0,
        incomplete_tasks: 0,
      },
    });

  it('blocks a milestone that was never reached', () => {
    const findings = byRule(evaluateAll(milestoneCtx('PENDING', null)), 'MILESTONE_AUTHORISATION');
    expect(blockers(findings).length).toBeGreaterThan(0);
  });

  it('blocks a milestone reached but not signed off by finance', () => {
    const findings = byRule(evaluateAll(milestoneCtx('REACHED', null)), 'MILESTONE_AUTHORISATION');
    expect(blockers(findings).length).toBeGreaterThan(0);
  });

  it('passes an approved milestone billed at its exact amount', () => {
    const findings = byRule(
      evaluateAll(milestoneCtx('APPROVED_INVOICED', '2026-04-20T00:00:00Z')),
      'MILESTONE_AUTHORISATION',
    );
    expect(findings).toEqual([]);
  });
});

describe('the rule set as a whole', () => {
  it('orders blockers before warnings so the reason for refusal reads first', () => {
    const findings = evaluateAll(
      ctx({
        lineItems: [line({ unit_rate: '1200.00', amount: '48000.00' })],
        contract: contract({ active: false }),
      }),
    );
    const firstWarning = findings.findIndex((f) => f.severity === 'WARNING');
    const lastBlocker = findings.map((f) => f.severity).lastIndexOf('BLOCKER');
    expect(lastBlocker).toBeLessThan(firstWarning);
  });

  it('exposes a stable code for every rule', () => {
    const codes = RULES.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('never produces a finding without a deterministic detail', () => {
    // `detail` is the finding; the AI explanation is optional decoration.
    for (const finding of evaluateAll(ctx({ lineItems: [line({ amount: '45000.00' })] }))) {
      expect(finding.detail.length).toBeGreaterThan(0);
    }
  });
});
