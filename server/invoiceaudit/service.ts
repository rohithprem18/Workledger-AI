import { query, queryOne, withTransaction, type Tx } from '../db/pool.ts';
import { BusinessRuleError, NotFoundError } from '../core/errors.ts';
import { recordAudit } from '../core/audit.ts';
import { completeJson, engineLabel, isAiEnabled } from '../ai/llm.ts';
import {
  approvedWorkValue,
  buildContext,
  contractAuthorisedTotal,
  invoicedTotal,
  type ReconciliationContext,
} from './context.ts';
import { evaluateAll, RULES, RULES_VERSION, verdictFor, type Finding, type Verdict } from './rules.ts';

/**
 * The deterministic invoice auditor.
 *
 * Reconciles an invoice against the contract, the approved work and the
 * invoice itself, then asks a language model to explain what it found. The
 * order is the point: every number, severity and verdict exists before the
 * model is called, so the model can only change how findings read — never
 * whether they exist or what they say happened.
 */

const NARRATOR_PROMPT = `You write short explanations of invoice audit findings for a finance
reviewer who is deciding whether to approve an invoice.

You will be given findings that have ALREADY been computed from the contract,
the approved work records and the invoice. Every number in them is correct and
final.

Return ONLY this JSON object, no prose and no markdown fences:

{"summary":"2-3 sentences on what to do about this invoice overall",
 "explanations":[{"index":0,"explanation":"1-2 sentences"}]}

Rules you must follow:
- NEVER state a number that is not already in the finding you were given. Do not
  add, subtract, convert, total or re-derive anything.
- Explain what the discrepancy means in business terms and what the reviewer
  should do about it. Do not restate the finding verbatim.
- Do not invent causes. If the finding does not say why something happened, say
  what should be checked, not what probably happened.
- Plain professional English. No bullet points, no headings.`;

interface Narration {
  summary: string;
  explanations: (string | null)[];
  engine: string;
}

/**
 * The summary used whenever the model is off or unavailable.
 *
 * Deliberately complete on its own — the platform is expected to run this way.
 */
export function templatedSummary(
  ctx: ReconciliationContext,
  findings: Finding[],
  verdict: Verdict,
): string {
  const head =
    `Reconciled invoice for "${ctx.contract.title}" covering ${ctx.invoice.period_start} to ` +
    `${ctx.invoice.period_end}. Contract authorises ${contractAuthorisedTotal(ctx).toFixed(2)}, ` +
    `approved work is worth ${approvedWorkValue(ctx).toFixed(2)}, and the invoice presents ` +
    `${invoicedTotal(ctx).toFixed(2)}.`;

  if (findings.length === 0) {
    return `${head} All three sources agree; nothing was flagged.`;
  }

  const blockers = findings.filter((f) => f.severity === 'BLOCKER').length;
  const warnings = findings.filter((f) => f.severity === 'WARNING').length;

  switch (verdict) {
    case 'BLOCKED':
      return `${head} ${blockers} blocking discrepancy(ies) must be resolved before this invoice can be approved.`;
    case 'ADVISORY':
      return `${head} ${warnings} item(s) are worth reviewing, but none block approval.`;
    default:
      return `${head} Nothing was flagged.`;
  }
}

/**
 * Turns computed findings into prose.
 *
 * The only place a model touches the audit, and it runs strictly after every
 * number is final. If it is off, fails, or returns nonsense, the audit is
 * unaffected — each finding's own `detail` already states the discrepancy.
 */
async function narrate(
  ctx: ReconciliationContext,
  findings: Finding[],
  verdict: Verdict,
): Promise<Narration> {
  const fallback = templatedSummary(ctx, findings, verdict);
  if (!isAiEnabled() || findings.length === 0) {
    return { summary: fallback, explanations: [], engine: 'deterministic' };
  }

  const payload = {
    verdict,
    contract: ctx.contract.title,
    billing_type: ctx.invoice.milestone_id ? 'MILESTONE' : 'HOURLY',
    period: `${ctx.invoice.period_start} to ${ctx.invoice.period_end}`,
    contract_authorised_total: contractAuthorisedTotal(ctx).toFixed(2),
    approved_work_total: approvedWorkValue(ctx).toFixed(2),
    invoiced_total: invoicedTotal(ctx).toFixed(2),
    findings: findings.map((f, index) => ({
      index,
      severity: f.severity,
      rule: f.ruleCode,
      title: f.title,
      detail: f.detail,
      expected: f.expectedValue ?? undefined,
      actual: f.actualValue ?? undefined,
    })),
  };

  const result = await completeJson<{
    summary?: string;
    explanations?: { index?: number; explanation?: string }[];
  }>(NARRATOR_PROMPT, JSON.stringify(payload));

  if (!result) {
    return { summary: fallback, explanations: [], engine: 'deterministic' };
  }

  const explanations: (string | null)[] = Array.from({ length: findings.length }, () => null);
  for (const entry of result.explanations ?? []) {
    const index = Number(entry.index);
    const text = entry.explanation?.trim();
    if (Number.isInteger(index) && index >= 0 && index < findings.length && text) {
      explanations[index] = text;
    }
  }

  return {
    summary: result.summary?.trim() || fallback,
    explanations,
    engine: engineLabel(),
  };
}

export interface AuditRunSummary {
  id: string;
  verdict: Verdict;
  blockerCount: number;
}

/** Runs the audit and persists the run plus its findings. */
export async function auditInvoice(invoiceId: string, actorId: string): Promise<AuditRunSummary> {
  const prepared = await withTransaction(async (tx) => {
    const ctx = await buildContext(tx, invoiceId);
    if (!ctx) throw new NotFoundError('Invoice', invoiceId);
    return ctx;
  });

  const findings = evaluateAll(prepared);
  const verdict = verdictFor(findings);

  // ---- everything above is deterministic; the model speaks only now ----
  const narration = await narrate(prepared, findings, verdict);

  const runId = await withTransaction(async (tx) => {
    const run = await tx.queryOne<{ id: string }>(
      `INSERT INTO invoice_audit_runs
         (invoice_id, verdict, blocker_count, warning_count, info_count,
          contract_total, approved_work_total, invoiced_total,
          narrative, narrative_engine, rules_version, run_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [
        invoiceId,
        verdict,
        findings.filter((f) => f.severity === 'BLOCKER').length,
        findings.filter((f) => f.severity === 'WARNING').length,
        findings.filter((f) => f.severity === 'INFO').length,
        contractAuthorisedTotal(prepared).toFixed(2),
        approvedWorkValue(prepared).toFixed(2),
        invoicedTotal(prepared).toFixed(2),
        narration.summary,
        narration.engine,
        RULES_VERSION,
        actorId,
      ],
    );

    for (const [index, finding] of findings.entries()) {
      await tx.query(
        `INSERT INTO invoice_audit_findings
           (run_id, rule_code, severity, title, detail, expected_value, actual_value,
            delta, line_item_id, explanation)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          run!.id,
          finding.ruleCode,
          finding.severity,
          finding.title,
          finding.detail,
          finding.expectedValue ?? null,
          finding.actualValue ?? null,
          finding.delta ?? null,
          finding.lineItemId ?? null,
          narration.explanations[index] ?? null,
        ],
      );
    }

    await recordAudit(
      {
        userId: actorId,
        action: 'RUN_INVOICE_AUDIT',
        entityType: 'Invoice',
        entityId: invoiceId,
        newValue: { verdict, findingCount: findings.length, rulesVersion: RULES_VERSION },
      },
      tx,
    );
    return run!.id;
  });

  return {
    id: runId,
    verdict,
    blockerCount: findings.filter((f) => f.severity === 'BLOCKER').length,
  };
}

const runColumns = `
  r.id, r.invoice_id AS "invoiceId", r.verdict,
  r.blocker_count AS "blockerCount", r.warning_count AS "warningCount",
  r.info_count AS "infoCount", r.contract_total AS "contractTotal",
  r.approved_work_total AS "approvedWorkTotal", r.invoiced_total AS "invoicedTotal",
  r.narrative, r.narrative_engine AS "narrativeEngine",
  r.rules_version AS "rulesVersion", r.created_at AS "createdAt"`;

const findingColumns = `
  id, rule_code AS "ruleCode", severity, title, detail,
  expected_value AS "expectedValue", actual_value AS "actualValue",
  delta, line_item_id AS "lineItemId", explanation`;

export async function findingsOf(runId: string) {
  return query(
    `SELECT ${findingColumns} FROM invoice_audit_findings
      WHERE run_id = $1
      ORDER BY CASE severity WHEN 'BLOCKER' THEN 0 WHEN 'WARNING' THEN 1 ELSE 2 END, created_at`,
    [runId],
  );
}

export async function runWithFindings(runId: string) {
  const run = await queryOne(`SELECT ${runColumns} FROM invoice_audit_runs r WHERE r.id = $1`, [
    runId,
  ]);
  if (!run) return null;
  return { ...run, findings: await findingsOf(runId) };
}

export async function latestRun(invoiceId: string) {
  const run = await queryOne<{ id: string }>(
    `SELECT ${runColumns} FROM invoice_audit_runs r
      WHERE r.invoice_id = $1 ORDER BY r.created_at DESC LIMIT 1`,
    [invoiceId],
  );
  if (!run) return null;
  return { ...run, findings: await findingsOf(run.id) };
}

export async function runHistory(invoiceId: string) {
  const runs = await query<{ id: string }>(
    `SELECT ${runColumns} FROM invoice_audit_runs r
      WHERE r.invoice_id = $1 ORDER BY r.created_at DESC`,
    [invoiceId],
  );
  return Promise.all(runs.map(async (r) => ({ ...r, findings: await findingsOf(r.id) })));
}

/**
 * The gate invoice approval consults.
 *
 * An invoice that has never been audited cannot be approved. That is
 * deliberate: silently treating "not checked" as "nothing wrong" would make
 * the auditor optional in exactly the cases it exists for.
 */
export async function assertApprovable(tx: Tx, invoiceId: string): Promise<void> {
  const invoice = await tx.queryOne<{ audit_override_reason: string | null }>(
    'SELECT audit_override_reason FROM invoices WHERE id = $1',
    [invoiceId],
  );
  if (invoice?.audit_override_reason) return;

  const latest = await tx.queryOne<{ verdict: Verdict; blocker_count: number }>(
    `SELECT verdict, blocker_count FROM invoice_audit_runs
      WHERE invoice_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [invoiceId],
  );
  if (!latest) {
    throw new BusinessRuleError(
      'This invoice has not been reconciled yet. Run the invoice audit before approving it.',
    );
  }
  if (latest.verdict === 'BLOCKED') {
    throw new BusinessRuleError(
      `The invoice audit found ${latest.blocker_count} blocking discrepancy(ies). ` +
        'Resolve them, or record an override with a reason, before approving this invoice.',
    );
  }
}

/** The rule set in force, for the "what gets checked" panel. */
export function ruleCodes(): string[] {
  return RULES.map((r) => r.code).sort();
}
