import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../db/pool.ts';
import { BusinessRuleError, NotFoundError } from '../core/errors.ts';
import { created, handler, ok, param, parseBody, parseQuery } from '../core/http.ts';
import { authenticate, requirePermission } from '../auth/middleware.ts';
import { recordAudit } from '../core/audit.ts';
import { generateMilestoneInvoice } from './invoices.service.ts';

/**
 * Contract milestones and their nested task trees.
 *
 * A milestone moves PENDING → REACHED (a delivery manager says the work is
 * done) → APPROVED_INVOICED (finance signs off, which raises the invoice).
 * Splitting "reached" from "approved" is what keeps the person who did the
 * work from being the person who authorises payment for it.
 */
export const milestoneRouter: Router = Router();
milestoneRouter.use(authenticate);

const milestoneSchema = z.object({
  sequenceOrder: z.coerce.number().int().min(1, 'Sequence order starts at 1'),
  label: z.string().trim().min(1, 'Label is required').max(255),
  thresholdPercent: z.coerce.number().min(0).max(100).nullish(),
  amount: z.coerce.number().gt(0, 'Milestone amount must be positive'),
});

const taskSchema = z.object({
  name: z.string().trim().min(1, 'Task name is required').max(255),
  description: z.string().trim().max(2000).nullish(),
  assignedToUserId: z.uuid().nullish(),
});

const taskStatusSchema = z.object({ status: z.enum(['PENDING', 'IN_PROGRESS', 'DONE']) });
const statusQuerySchema = z.object({
  status: z.enum(['PENDING', 'REACHED', 'APPROVED_INVOICED']).optional(),
});

const milestoneColumns = `
  m.id, m.contract_id AS "contractId", c.title AS "contractTitle",
  m.sequence_order AS "sequenceOrder", m.label, m.threshold_percent AS "thresholdPercent",
  m.amount, m.status, m.marked_by_user_id AS "markedByUserId", m.marked_at AS "markedAt",
  m.approved_by_user_id AS "approvedByUserId", m.approved_at AS "approvedAt",
  m.invoice_id AS "invoiceId",
  (SELECT count(*)::int FROM milestone_tasks t WHERE t.milestone_id = m.id) AS "totalTasks",
  (SELECT count(*)::int FROM milestone_tasks t WHERE t.milestone_id = m.id AND t.status = 'DONE')
    AS "completedTasks"`;

const milestoneFrom = `FROM contract_milestones m JOIN contracts c ON c.id = m.contract_id`;

const taskColumns = `
  t.id, t.milestone_id AS "milestoneId", t.parent_id AS "parentId", t.name, t.description,
  t.assigned_to_user_id AS "assignedToUserId", t.status,
  (SELECT count(*)::int FROM milestone_tasks c WHERE c.parent_id = t.id) AS "childCount"`;

// ------------------------------------------------------------ milestones

milestoneRouter.post(
  '/contracts/:contractId/milestones',
  requirePermission('CREATE_CONTRACT', 'MARK_MILESTONE'),
  handler(async (req, res) => {
    const contractId = param(req, 'contractId');
    const body = parseBody(milestoneSchema, req.body);

    if (!(await queryOne('SELECT 1 FROM contracts WHERE id = $1', [contractId]))) {
      throw new NotFoundError('Contract', contractId);
    }
    const clash = await queryOne(
      'SELECT 1 FROM contract_milestones WHERE contract_id = $1 AND sequence_order = $2',
      [contractId, body.sequenceOrder],
    );
    if (clash) {
      throw new BusinessRuleError(
        `This contract already has a milestone at position ${body.sequenceOrder}`,
      );
    }

    const inserted = await queryOne<{ id: string }>(
      `INSERT INTO contract_milestones (contract_id, sequence_order, label, threshold_percent, amount)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        contractId,
        body.sequenceOrder,
        body.label,
        body.thresholdPercent ?? null,
        body.amount,
      ],
    );
    await recordAudit({
      userId: req.user!.id,
      action: 'CREATE_MILESTONE',
      entityType: 'ContractMilestone',
      entityId: inserted!.id,
      newValue: body,
    });

    return created(
      res,
      await queryOne(`SELECT ${milestoneColumns} ${milestoneFrom} WHERE m.id = $1`, [inserted!.id]),
    );
  }),
);

milestoneRouter.get(
  '/contracts/:contractId/milestones',
  requirePermission('VIEW_CONTRACTS'),
  handler(async (req, res) =>
    ok(
      res,
      await query(
        `SELECT ${milestoneColumns} ${milestoneFrom} WHERE m.contract_id = $1 ORDER BY m.sequence_order`,
        [param(req, 'contractId')],
      ),
    ),
  ),
);

milestoneRouter.get(
  '/milestones',
  requirePermission('VIEW_CONTRACTS', 'APPROVE_MILESTONE'),
  handler(async (req, res) => {
    const { status } = parseQuery(statusQuerySchema, req.query);
    return ok(
      res,
      await query(
        `SELECT ${milestoneColumns} ${milestoneFrom}
          WHERE ($1::text IS NULL OR m.status = $1)
          ORDER BY m.marked_at DESC NULLS LAST, m.sequence_order`,
        [status ?? null],
      ),
    );
  }),
);

milestoneRouter.put(
  '/milestones/:id/reach',
  requirePermission('MARK_MILESTONE'),
  handler(async (req, res) => {
    const id = param(req, 'id');

    await withTransaction(async (tx) => {
      const milestone = await tx.queryOne<{ id: string; status: string; label: string }>(
        'SELECT id, status, label FROM contract_milestones WHERE id = $1 FOR UPDATE',
        [id],
      );
      if (!milestone) throw new NotFoundError('Milestone', id);
      if (milestone.status !== 'PENDING') {
        throw new BusinessRuleError(
          `"${milestone.label}" is already ${milestone.status} and cannot be marked reached again`,
        );
      }

      const incomplete = await tx.queryOne<{ count: string }>(
        `SELECT count(*) AS count FROM milestone_tasks
          WHERE milestone_id = $1 AND status <> 'DONE'`,
        [id],
      );
      if (Number(incomplete?.count ?? 0) > 0) {
        throw new BusinessRuleError(
          `"${milestone.label}" has ${incomplete!.count} unfinished task(s). ` +
            'Complete them before marking the milestone reached.',
        );
      }

      await tx.query(
        `UPDATE contract_milestones
            SET status = 'REACHED', marked_by_user_id = $2, marked_at = now(), updated_at = now()
          WHERE id = $1`,
        [id, req.user!.id],
      );
      await recordAudit(
        {
          userId: req.user!.id,
          action: 'MARK_MILESTONE_REACHED',
          entityType: 'ContractMilestone',
          entityId: id,
          oldValue: { status: 'PENDING' },
          newValue: { status: 'REACHED' },
        },
        tx,
      );
    });

    return ok(res, await queryOne(`SELECT ${milestoneColumns} ${milestoneFrom} WHERE m.id = $1`, [id]));
  }),
);

/**
 * Finance approval, which is also what raises the milestone invoice.
 *
 * Both happen in one transaction: a milestone marked approved without its
 * invoice, or an invoice for a milestone that was never approved, would each
 * be a discrepancy the auditor then has to report.
 */
milestoneRouter.put(
  '/milestones/:id/approve',
  requirePermission('APPROVE_MILESTONE'),
  handler(async (req, res) => {
    const id = param(req, 'id');

    await withTransaction(async (tx) => {
      const milestone = await tx.queryOne<{
        id: string;
        status: string;
        label: string;
        marked_by_user_id: string | null;
      }>(
        'SELECT id, status, label, marked_by_user_id FROM contract_milestones WHERE id = $1 FOR UPDATE',
        [id],
      );
      if (!milestone) throw new NotFoundError('Milestone', id);

      if (milestone.status === 'PENDING') {
        throw new BusinessRuleError(
          `"${milestone.label}" has not been marked reached yet, so there is nothing to approve`,
        );
      }
      if (milestone.status === 'APPROVED_INVOICED') {
        throw new BusinessRuleError(`"${milestone.label}" has already been approved and invoiced`);
      }
      // Whoever declared the work done must not also authorise paying for it.
      if (milestone.marked_by_user_id === req.user!.id) {
        throw new BusinessRuleError(
          'You marked this milestone reached, so someone else must approve it',
        );
      }

      const invoiceId = await generateMilestoneInvoice(tx, {
        milestoneId: id,
        actorId: req.user!.id,
      });

      await tx.query(
        `UPDATE contract_milestones
            SET status = 'APPROVED_INVOICED', approved_by_user_id = $2, approved_at = now(),
                invoice_id = $3, updated_at = now()
          WHERE id = $1`,
        [id, req.user!.id, invoiceId],
      );
      await recordAudit(
        {
          userId: req.user!.id,
          action: 'APPROVE_MILESTONE',
          entityType: 'ContractMilestone',
          entityId: id,
          oldValue: { status: 'REACHED' },
          newValue: { status: 'APPROVED_INVOICED', invoiceId },
        },
        tx,
      );
    });

    return ok(
      res,
      await queryOne(`SELECT ${milestoneColumns} ${milestoneFrom} WHERE m.id = $1`, [id]),
      'Milestone approved and invoice raised',
    );
  }),
);

// ----------------------------------------------------------------- tasks

milestoneRouter.get(
  '/milestones/:milestoneId/tasks',
  requirePermission('VIEW_CONTRACTS'),
  handler(async (req, res) =>
    ok(
      res,
      await query(
        `SELECT ${taskColumns} FROM milestone_tasks t WHERE t.milestone_id = $1
          ORDER BY t.parent_id NULLS FIRST, t.created_at`,
        [param(req, 'milestoneId')],
      ),
    ),
  ),
);

milestoneRouter.post(
  '/milestones/:milestoneId/tasks',
  requirePermission('MARK_MILESTONE', 'CREATE_CONTRACT'),
  handler(async (req, res) => {
    const milestoneId = param(req, 'milestoneId');
    const body = parseBody(taskSchema, req.body);

    if (!(await queryOne('SELECT 1 FROM contract_milestones WHERE id = $1', [milestoneId]))) {
      throw new NotFoundError('Milestone', milestoneId);
    }

    const inserted = await queryOne<{ id: string }>(
      `INSERT INTO milestone_tasks (milestone_id, name, description, assigned_to_user_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [milestoneId, body.name, body.description ?? null, body.assignedToUserId ?? null],
    );
    return created(
      res,
      await queryOne(`SELECT ${taskColumns} FROM milestone_tasks t WHERE t.id = $1`, [inserted!.id]),
    );
  }),
);

milestoneRouter.post(
  '/tasks/:parentTaskId/subtasks',
  requirePermission('MARK_MILESTONE', 'CREATE_CONTRACT'),
  handler(async (req, res) => {
    const parentId = param(req, 'parentTaskId');
    const body = parseBody(taskSchema, req.body);

    const parent = await queryOne<{ milestone_id: string }>(
      'SELECT milestone_id FROM milestone_tasks WHERE id = $1',
      [parentId],
    );
    if (!parent) throw new NotFoundError('Task', parentId);

    const inserted = await queryOne<{ id: string }>(
      `INSERT INTO milestone_tasks (milestone_id, parent_id, name, description, assigned_to_user_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        parent.milestone_id,
        parentId,
        body.name,
        body.description ?? null,
        body.assignedToUserId ?? null,
      ],
    );
    return created(
      res,
      await queryOne(`SELECT ${taskColumns} FROM milestone_tasks t WHERE t.id = $1`, [inserted!.id]),
    );
  }),
);

milestoneRouter.put(
  '/tasks/:taskId/status',
  handler(async (req, res) => {
    const taskId = param(req, 'taskId');
    const { status } = parseBody(taskStatusSchema, req.body);

    const task = await queryOne<{ id: string; assigned_to_user_id: string | null }>(
      'SELECT id, assigned_to_user_id FROM milestone_tasks WHERE id = $1',
      [taskId],
    );
    if (!task) throw new NotFoundError('Task', taskId);

    // The assignee may progress their own task; otherwise it takes a manager.
    const isAssignee = task.assigned_to_user_id === req.user!.id;
    if (!isAssignee && !req.user!.permissions.includes('MARK_MILESTONE')) {
      throw new BusinessRuleError('You can only update tasks assigned to you');
    }

    if (status === 'DONE') {
      const openChildren = await queryOne<{ count: string }>(
        `SELECT count(*) AS count FROM milestone_tasks WHERE parent_id = $1 AND status <> 'DONE'`,
        [taskId],
      );
      if (Number(openChildren?.count ?? 0) > 0) {
        throw new BusinessRuleError(
          `This task has ${openChildren!.count} unfinished subtask(s). Complete them first.`,
        );
      }
    }

    await query('UPDATE milestone_tasks SET status = $2, updated_at = now() WHERE id = $1', [
      taskId,
      status,
    ]);
    return ok(res, await queryOne(`SELECT ${taskColumns} FROM milestone_tasks t WHERE t.id = $1`, [taskId]));
  }),
);

milestoneRouter.delete(
  '/tasks/:taskId',
  requirePermission('MARK_MILESTONE', 'CREATE_CONTRACT'),
  handler(async (req, res) => {
    const taskId = param(req, 'taskId');
    if (!(await queryOne('SELECT 1 FROM milestone_tasks WHERE id = $1', [taskId]))) {
      throw new NotFoundError('Task', taskId);
    }
    // Subtasks cascade at the schema level.
    await query('DELETE FROM milestone_tasks WHERE id = $1', [taskId]);
    return ok(res, null, 'Task deleted');
  }),
);

milestoneRouter.get(
  '/tasks/mine',
  handler(async (req, res) =>
    ok(
      res,
      await query(
        `SELECT ${taskColumns}, m.label AS "milestoneLabel", c.title AS "contractTitle"
           FROM milestone_tasks t
           JOIN contract_milestones m ON m.id = t.milestone_id
           JOIN contracts c ON c.id = m.contract_id
          WHERE t.assigned_to_user_id = $1
          ORDER BY t.status, t.created_at`,
        [req.user!.id],
      ),
    ),
  ),
);
