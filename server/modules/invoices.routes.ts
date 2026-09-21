import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../db/pool.ts';
import { BusinessRuleError, NotFoundError } from '../core/errors.ts';
import { created, handler, ok, param, parseBody } from '../core/http.ts';
import { authenticate, requirePermission } from '../auth/middleware.ts';
import { recordAudit } from '../core/audit.ts';
import {
  findInvoice,
  generateHourlyInvoice,
  invoiceColumns,
  invoiceFrom,
  withLineItems,
} from './invoices.service.ts';
import {
  assertApprovable,
  auditInvoice,
  latestRun,
  runHistory,
  ruleCodes,
} from '../invoiceaudit/service.ts';

export const invoiceRouter: Router = Router();
invoiceRouter.use(authenticate);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must look like 2026-04-01');

const generateSchema = z.object({
  contractId: z.uuid('Contract is required'),
  periodStart: isoDate,
  periodEnd: isoDate,
});

const overrideSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, 'State why the blocking findings are being accepted (at least 10 characters)')
    .max(2000),
});

invoiceRouter.post(
  '/invoices',
  requirePermission('GENERATE_INVOICE'),
  handler(async (req, res) => {
    const body = parseBody(generateSchema, req.body);
    const id = await withTransaction((tx) =>
      generateHourlyInvoice(tx, { ...body, actorId: req.user!.id }),
    );
    return created(res, await findInvoice(id));
  }),
);

/**
 * Approving sends money to a client, so it is gated on a reconciliation that
 * actually ran — see `assertApprovable`. An un-audited invoice is refused
 * rather than assumed clean.
 */
invoiceRouter.put(
  '/invoices/:id/approve',
  requirePermission('APPROVE_INVOICE'),
  handler(async (req, res) => {
    const id = param(req, 'id');

    await withTransaction(async (tx) => {
      const invoice = await tx.queryOne<{ id: string; status: string }>(
        'SELECT id, status FROM invoices WHERE id = $1 FOR UPDATE',
        [id],
      );
      if (!invoice) throw new NotFoundError('Invoice', id);
      if (invoice.status !== 'DRAFT') {
        throw new BusinessRuleError(
          `Only DRAFT invoices can be approved. This one is ${invoice.status}.`,
        );
      }

      await assertApprovable(tx, id);

      await tx.query(
        `UPDATE invoices SET status = 'APPROVED', approved_at = now(), updated_at = now()
          WHERE id = $1`,
        [id],
      );
      await recordAudit(
        {
          userId: req.user!.id,
          action: 'APPROVE_INVOICE',
          entityType: 'Invoice',
          entityId: id,
          oldValue: { status: 'DRAFT' },
          newValue: { status: 'APPROVED' },
        },
        tx,
      );
    });

    return ok(res, await findInvoice(id), 'Invoice approved');
  }),
);

invoiceRouter.get(
  '/invoices',
  requirePermission('VIEW_INVOICES'),
  handler(async (_req, res) => {
    const invoices = await query<{ id: string }>(
      `SELECT ${invoiceColumns} ${invoiceFrom} ORDER BY i.created_at DESC`,
    );
    return ok(res, await withLineItems(invoices));
  }),
);

invoiceRouter.get(
  '/invoices/:id',
  requirePermission('VIEW_INVOICES'),
  handler(async (req, res) => {
    const invoice = await findInvoice(param(req, 'id'));
    if (!invoice) throw new NotFoundError('Invoice', param(req, 'id'));
    return ok(res, invoice);
  }),
);

invoiceRouter.get(
  '/contracts/:contractId/invoices',
  requirePermission('VIEW_INVOICES'),
  handler(async (req, res) => {
    const invoices = await query<{ id: string }>(
      `SELECT ${invoiceColumns} ${invoiceFrom} WHERE i.contract_id = $1 ORDER BY i.created_at DESC`,
      [param(req, 'contractId')],
    );
    return ok(res, await withLineItems(invoices));
  }),
);

/**
 * A plain-text invoice report.
 *
 * The Java version produced a PDF with iText. Generating one here would mean
 * bundling a PDF engine into a serverless function for a document with four
 * columns, so this returns text the browser downloads under the same filename
 * the client already expects.
 */
invoiceRouter.get(
  '/invoices/:id/report',
  requirePermission('VIEW_INVOICES'),
  handler(async (req, res) => {
    const invoice = (await findInvoice(param(req, 'id'))) as
      | (Record<string, unknown> & { lineItems: Record<string, unknown>[] })
      | null;
    if (!invoice) throw new NotFoundError('Invoice', param(req, 'id'));

    const lines = [
      'WORKLEDGER AI — INVOICE',
      '='.repeat(60),
      `Invoice:   ${invoice.id as string}`,
      `Contract:  ${invoice.contractTitle as string}`,
      `Period:    ${invoice.periodStart as string} to ${invoice.periodEnd as string}`,
      `Status:    ${invoice.status as string}`,
      '',
      'LINE ITEMS',
      '-'.repeat(60),
      ...invoice.lineItems.map(
        (item) =>
          `${String(item.description)}\n    ${String(item.quantity)} x ${String(item.unitRate)}` +
          ` = ${String(item.amount)}`,
      ),
      '-'.repeat(60),
      `TOTAL: ${String(invoice.totalAmount)}`,
      '',
      `Generated ${new Date().toISOString()}`,
    ];

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="invoice-${invoice.id as string}-report.txt"`,
    );
    return res.send(lines.join('\n'));
  }),
);

// ---------------------------------------------------------- invoice audit

invoiceRouter.post(
  '/invoices/:invoiceId/audit',
  requirePermission('RUN_INVOICE_AUDIT'),
  handler(async (req, res) => {
    const invoiceId = param(req, 'invoiceId');
    const summary = await auditInvoice(invoiceId, req.user!.id);
    const run = await latestRun(invoiceId);

    const message =
      summary.verdict === 'CLEAN'
        ? 'All three sources reconcile. Nothing flagged.'
        : summary.verdict === 'ADVISORY'
          ? 'Items to review; approval is not blocked.'
          : `${summary.blockerCount} blocking discrepancy(ies) found. ` +
            'Approval is refused until they are resolved or overridden.';

    return ok(res, run, message);
  }),
);

invoiceRouter.get(
  '/invoices/:invoiceId/audit',
  requirePermission('VIEW_INVOICE_AUDIT'),
  handler(async (req, res) => ok(res, await latestRun(param(req, 'invoiceId')))),
);

invoiceRouter.get(
  '/invoices/:invoiceId/audit/history',
  requirePermission('VIEW_INVOICE_AUDIT'),
  handler(async (req, res) => ok(res, await runHistory(param(req, 'invoiceId')))),
);

/**
 * Records a deliberate decision to approve despite blockers. The reason and
 * the person are stored on the invoice, so the override is as auditable as the
 * findings it overrides.
 */
invoiceRouter.post(
  '/invoices/:invoiceId/audit/override',
  requirePermission('OVERRIDE_INVOICE_AUDIT'),
  handler(async (req, res) => {
    const invoiceId = param(req, 'invoiceId');
    const { reason } = parseBody(overrideSchema, req.body);

    await withTransaction(async (tx) => {
      const invoice = await tx.queryOne('SELECT id FROM invoices WHERE id = $1', [invoiceId]);
      if (!invoice) throw new NotFoundError('Invoice', invoiceId);

      const run = await tx.queryOne('SELECT id FROM invoice_audit_runs WHERE invoice_id = $1', [
        invoiceId,
      ]);
      if (!run) {
        throw new BusinessRuleError(
          'There is nothing to override — this invoice has not been audited.',
        );
      }

      await tx.query(
        `UPDATE invoices
            SET audit_override_reason = $2, audit_override_by = $3,
                audit_override_at = now(), updated_at = now()
          WHERE id = $1`,
        [invoiceId, reason, req.user!.id],
      );
      await recordAudit(
        {
          userId: req.user!.id,
          action: 'OVERRIDE_INVOICE_AUDIT',
          entityType: 'Invoice',
          entityId: invoiceId,
          newValue: { reason },
        },
        tx,
      );
    });

    return ok(
      res,
      reason,
      'Override recorded. This invoice can now be approved despite its blocking findings.',
    );
  }),
);

invoiceRouter.get(
  '/invoice-audit/rules',
  requirePermission('VIEW_INVOICE_AUDIT'),
  handler(async (_req, res) => ok(res, ruleCodes())),
);
