import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../db/pool.ts';
import { BusinessRuleError, NotFoundError } from '../core/errors.ts';
import { created, handler, ok, param, parseBody, parseQuery } from '../core/http.ts';
import { authenticate, requirePermission } from '../auth/middleware.ts';
import { recordAudit } from '../core/audit.ts';
import { anyOverlap, durationMinutes, overlaps, type TimeWindow } from '../domain/timeWindow.ts';

/**
 * Timesheets: multiple time segments per day, submitted for approval.
 *
 * Two properties make approved work usable as a billing source, and both are
 * enforced here rather than trusted from the client:
 *
 *   - `total_actual_minutes` is summed from the segments server-side. A client
 *     never states how long it worked.
 *   - an approved log is immutable. Corrections go through rejection, so an
 *     invoice raised against approved hours cannot have those hours change
 *     underneath it afterwards.
 */
export const worklogRouter: Router = Router();
worklogRouter.use(authenticate);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must look like 2026-04-01');
const isoTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Time must look like 09:00');

const createSchema = z.object({
  assignmentId: z.uuid('Assignment is required'),
  workDate: isoDate,
  segments: z
    .array(z.object({ startTime: isoTime, endTime: isoTime }))
    .min(1, 'At least one time segment is required'),
});

const approvalSchema = z.object({
  approved: z.boolean(),
  rejectionReason: z.string().trim().max(2000).nullish(),
});

const rangeQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  employeeId: z.uuid().optional(),
});

const worklogColumns = `
  w.id, w.assignment_id AS "assignmentId", w.employee_id AS "employeeId",
  (e.first_name || ' ' || e.last_name) AS "employeeName",
  w.work_date AS "workDate", w.status, w.total_actual_minutes AS "totalActualMinutes",
  w.submitted_at AS "submittedAt", w.approved_at AS "approvedAt",
  w.rejection_reason AS "rejectionReason"`;

const worklogFrom = `FROM work_logs w JOIN employees e ON e.id = w.employee_id`;

/** Attaches segments to a set of work logs in one extra query, not N. */
async function withSegments<T extends { id: string }>(logs: T[]) {
  if (logs.length === 0) return [];
  const segments = await query<{ work_log_id: string }>(
    `SELECT work_log_id, id, start_time AS "startTime", end_time AS "endTime"
       FROM work_log_segments WHERE work_log_id = ANY($1::uuid[]) ORDER BY start_time`,
    [`{${logs.map((l) => l.id).join(',')}}`],
  );
  const byLog = new Map<string, unknown[]>();
  for (const row of segments) {
    const { work_log_id: logId, ...segment } = row;
    if (!byLog.has(logId)) byLog.set(logId, []);
    byLog.get(logId)!.push(segment);
  }
  return logs.map((l) => ({ ...l, segments: byLog.get(l.id) ?? [] }));
}

worklogRouter.post(
  '/worklogs',
  requirePermission('SUBMIT_TIMESHEET'),
  handler(async (req, res) => {
    const body = parseBody(createSchema, req.body);
    const windows: TimeWindow[] = body.segments;

    for (const segment of windows) {
      if (durationMinutes(segment) <= 0) {
        throw new BusinessRuleError(
          `Segment ${segment.startTime}–${segment.endTime} has no duration`,
        );
      }
    }
    // Segments within one submission must not overlap each other.
    if (anyOverlap(windows)) {
      throw new BusinessRuleError('The time segments in this submission overlap each other');
    }

    const id = await withTransaction(async (tx) => {
      const assignment = await tx.queryOne<{
        id: string;
        employee_id: string;
        status: string;
        start_date: string;
        end_date: string;
      }>(
        'SELECT id, employee_id, status, start_date, end_date FROM assignments WHERE id = $1',
        [body.assignmentId],
      );
      if (!assignment) throw new NotFoundError('Assignment', body.assignmentId);

      // A contractor logs only against their own assignment.
      if (req.user!.employeeId && assignment.employee_id !== req.user!.employeeId) {
        throw new BusinessRuleError('You can only log work against your own assignments');
      }
      if (assignment.status !== 'ACTIVE') {
        throw new BusinessRuleError('This assignment is cancelled and cannot be logged against');
      }
      if (body.workDate < assignment.start_date || body.workDate > assignment.end_date) {
        throw new BusinessRuleError(
          `${body.workDate} falls outside the assignment period ` +
            `(${assignment.start_date} to ${assignment.end_date})`,
        );
      }

      const duplicate = await tx.queryOne(
        `SELECT 1 FROM work_logs WHERE assignment_id = $1 AND work_date = $2
           AND status <> 'REJECTED'`,
        [body.assignmentId, body.workDate],
      );
      if (duplicate) {
        throw new BusinessRuleError(
          `Work for ${body.workDate} has already been logged against this assignment`,
        );
      }

      // Across *all* the contractor's logs that day, including other contracts:
      // real hours cannot be in two places at once.
      const sameDay = await tx.query<{ start_time: string; end_time: string; title: string }>(
        `SELECT s.start_time, s.end_time, c.title
           FROM work_logs w
           JOIN work_log_segments s ON s.work_log_id = w.id
           JOIN assignments a ON a.id = w.assignment_id
           JOIN contract_requirements r ON r.id = a.requirement_id
           JOIN contracts c ON c.id = r.contract_id
          WHERE w.employee_id = $1 AND w.work_date = $2 AND w.status <> 'REJECTED'`,
        [assignment.employee_id, body.workDate],
      );
      for (const existing of sameDay) {
        const existingWindow: TimeWindow = {
          startTime: existing.start_time,
          endTime: existing.end_time,
        };
        for (const segment of windows) {
          if (overlaps(segment, existingWindow)) {
            throw new BusinessRuleError(
              `${segment.startTime}–${segment.endTime} overlaps time already logged on ` +
                `${body.workDate} against "${existing.title}"`,
            );
          }
        }
      }

      // Server-side, from the segments. Never accepted from the client.
      const totalMinutes = windows.reduce((sum, w) => sum + durationMinutes(w), 0);

      const log = await tx.queryOne<{ id: string }>(
        `INSERT INTO work_logs
           (assignment_id, employee_id, work_date, status, total_actual_minutes, submitted_at)
         VALUES ($1, $2, $3, 'SUBMITTED', $4, now()) RETURNING id`,
        [body.assignmentId, assignment.employee_id, body.workDate, totalMinutes],
      );
      for (const segment of windows) {
        await tx.query(
          'INSERT INTO work_log_segments (work_log_id, start_time, end_time) VALUES ($1, $2, $3)',
          [log!.id, segment.startTime, segment.endTime],
        );
      }
      await recordAudit(
        {
          userId: req.user!.id,
          action: 'SUBMIT_TIMESHEET',
          entityType: 'WorkLog',
          entityId: log!.id,
          newValue: { ...body, totalActualMinutes: totalMinutes },
        },
        tx,
      );
      return log!.id;
    });

    const log = await queryOne(`SELECT ${worklogColumns} ${worklogFrom} WHERE w.id = $1`, [id]);
    const [withSegs] = await withSegments([log as { id: string }]);
    return created(res, withSegs);
  }),
);

worklogRouter.put(
  '/worklogs/:id/approve',
  requirePermission('APPROVE_TIMESHEET'),
  handler(async (req, res) => {
    const id = param(req, 'id');
    const body = parseBody(approvalSchema, req.body);

    if (!body.approved && !body.rejectionReason?.trim()) {
      throw new BusinessRuleError('A rejection must state a reason');
    }

    await withTransaction(async (tx) => {
      const log = await tx.queryOne<{ id: string; status: string; employee_id: string }>(
        'SELECT id, status, employee_id FROM work_logs WHERE id = $1 FOR UPDATE',
        [id],
      );
      if (!log) throw new NotFoundError('Work log', id);

      if (log.status === 'APPROVED') {
        throw new BusinessRuleError(
          'This work log is already approved. Approved work is immutable because ' +
            'invoices are raised against it.',
        );
      }
      if (log.status !== 'SUBMITTED') {
        throw new BusinessRuleError(`Only submitted work logs can be reviewed (this one is ${log.status})`);
      }
      // A contractor must not approve their own timesheet.
      if (req.user!.employeeId && req.user!.employeeId === log.employee_id) {
        throw new BusinessRuleError('You cannot approve your own timesheet');
      }

      await tx.query(
        `UPDATE work_logs
            SET status = $2, approved_at = CASE WHEN $2 = 'APPROVED' THEN now() ELSE NULL END,
                approved_by = $3, rejection_reason = $4, updated_at = now()
          WHERE id = $1`,
        [
          id,
          body.approved ? 'APPROVED' : 'REJECTED',
          req.user!.id,
          body.approved ? null : body.rejectionReason!.trim(),
        ],
      );
      await recordAudit(
        {
          userId: req.user!.id,
          action: body.approved ? 'APPROVE_TIMESHEET' : 'REJECT_TIMESHEET',
          entityType: 'WorkLog',
          entityId: id,
          oldValue: { status: log.status },
          newValue: {
            status: body.approved ? 'APPROVED' : 'REJECTED',
            rejectionReason: body.rejectionReason ?? null,
          },
        },
        tx,
      );
    });

    const log = await queryOne(`SELECT ${worklogColumns} ${worklogFrom} WHERE w.id = $1`, [id]);
    const [withSegs] = await withSegments([log as { id: string }]);
    return ok(res, withSegs);
  }),
);

worklogRouter.get(
  '/worklogs',
  requirePermission('VIEW_TIMESHEETS'),
  handler(async (req, res) => {
    const { from, to } = parseQuery(rangeQuerySchema, req.query);
    const logs = await query<{ id: string }>(
      `SELECT ${worklogColumns} ${worklogFrom}
        WHERE w.status = 'SUBMITTED'
          AND ($1::date IS NULL OR w.work_date >= $1)
          AND ($2::date IS NULL OR w.work_date <= $2)
        ORDER BY w.work_date DESC, w.submitted_at DESC`,
      [from ?? null, to ?? null],
    );
    return ok(res, await withSegments(logs));
  }),
);

worklogRouter.get(
  '/worklogs/approved',
  requirePermission('VIEW_TIMESHEETS'),
  handler(async (req, res) => {
    const { from, to } = parseQuery(rangeQuerySchema, req.query);
    const logs = await query<{ id: string }>(
      `SELECT ${worklogColumns} ${worklogFrom}
        WHERE w.status = 'APPROVED'
          AND ($1::date IS NULL OR w.work_date >= $1)
          AND ($2::date IS NULL OR w.work_date <= $2)
        ORDER BY w.work_date DESC`,
      [from ?? null, to ?? null],
    );
    return ok(res, await withSegments(logs));
  }),
);

worklogRouter.get(
  '/worklogs/mine',
  handler(async (req, res) => {
    const { from, to, employeeId } = parseQuery(rangeQuerySchema, req.query);
    const target = req.user!.employeeId ?? employeeId;
    if (!target) {
      throw new BusinessRuleError('This account is not linked to a contractor profile');
    }
    if (req.user!.employeeId && employeeId && employeeId !== req.user!.employeeId) {
      throw new BusinessRuleError('You can only view your own timesheets');
    }

    const logs = await query<{ id: string }>(
      `SELECT ${worklogColumns} ${worklogFrom}
        WHERE w.employee_id = $1
          AND ($2::date IS NULL OR w.work_date >= $2)
          AND ($3::date IS NULL OR w.work_date <= $3)
        ORDER BY w.work_date DESC`,
      [target, from ?? null, to ?? null],
    );
    return ok(res, await withSegments(logs));
  }),
);
