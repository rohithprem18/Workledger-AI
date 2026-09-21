import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction, type Tx } from '../db/pool.js';
import { BusinessRuleError, NotFoundError } from '../core/errors.js';
import { created, handler, ok, param, parseBody, parseQuery } from '../core/http.js';
import { authenticate, requirePermission } from '../auth/middleware.js';
import { recordAudit } from '../core/audit.js';
import { assertAllSatisfied, isSatisfied, type DateRange } from '../domain/specifications.js';
import type { TimeWindow } from '../domain/timeWindow.js';

/**
 * Placing contractors against contract requirements.
 *
 * `createAssignment` below is the only code anywhere permitted to insert an
 * `assignments` row. Bulk allocation is a *caller* of it, not a second write
 * path — which is what guarantees the two cannot validate differently.
 */
export const assignmentRouter: Router = Router();
assignmentRouter.use(authenticate);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must look like 2026-04-01');
const isoTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Time must look like 09:00');

const assignmentSchema = z.object({
  employeeId: z.guid('Contractor is required'),
  requirementId: z.guid('Requirement is required'),
  startDate: isoDate,
  endDate: isoDate,
  plannedStartTime: isoTime,
  plannedEndTime: isoTime,
});

const bulkSchema = z.object({
  assignments: z.array(assignmentSchema).min(1, 'At least one assignment is required'),
});

const eligibleQuerySchema = z.object({ startDate: isoDate.optional(), endDate: isoDate.optional() });
const mineQuerySchema = z.object({ employeeId: z.guid().optional() });

const assignmentColumns = `
  a.id, a.employee_id AS "employeeId",
  (e.first_name || ' ' || e.last_name) AS "employeeName",
  a.requirement_id AS "requirementId", s.name AS "skillName",
  r.contract_id AS "contractId", c.title AS "contractTitle",
  a.start_date AS "startDate", a.end_date AS "endDate",
  a.planned_start_time AS "plannedStartTime", a.planned_end_time AS "plannedEndTime",
  a.status`;

const assignmentFrom = `
  FROM assignments a
  JOIN employees e ON e.id = a.employee_id
  JOIN contract_requirements r ON r.id = a.requirement_id
  JOIN skills s ON s.id = r.skill_id
  JOIN contracts c ON c.id = r.contract_id`;

type AssignmentInput = z.infer<typeof assignmentSchema>;

/**
 * The single write path for an assignment.
 *
 * Inside one transaction it:
 *   1. locks the contractor's row with SELECT ... FOR UPDATE
 *   2. re-runs the entire specification chain *after* the lock, against data
 *      that can no longer change underneath it
 *   3. inserts the assignment and bumps `fulfilled_count` atomically
 *
 * Step 2 is the one that matters. Validating only before the lock would let two
 * managers assigning the same contractor both pass, and both insert.
 */
async function createAssignment(
  tx: Tx,
  input: AssignmentInput,
  actorId: string,
): Promise<string> {
  if (input.endDate < input.startDate) {
    throw new BusinessRuleError(
      `Assignment ends (${input.endDate}) before it starts (${input.startDate})`,
    );
  }

  // Serialises concurrent assignment attempts for this contractor.
  const locked = await tx.queryOne<{ id: string }>(
    'SELECT id FROM employees WHERE id = $1 FOR UPDATE',
    [input.employeeId],
  );
  if (!locked) throw new NotFoundError('Employee', input.employeeId);

  const requirement = await tx.queryOne<{
    id: string;
    contract_id: string;
    required_employee_count: number;
    fulfilled_count: number;
    start_date: string;
    end_date: string;
    skill_name: string;
  }>(
    `SELECT r.id, r.contract_id, r.required_employee_count, r.fulfilled_count,
            r.start_date, r.end_date, s.name AS skill_name
       FROM contract_requirements r JOIN skills s ON s.id = r.skill_id
      WHERE r.id = $1 FOR UPDATE OF r`,
    [input.requirementId],
  );
  if (!requirement) throw new NotFoundError('Requirement', input.requirementId);

  if (requirement.fulfilled_count >= requirement.required_employee_count) {
    throw new BusinessRuleError(
      `"${requirement.skill_name}" is already fully staffed ` +
        `(${requirement.fulfilled_count}/${requirement.required_employee_count})`,
    );
  }
  if (input.startDate < requirement.start_date || input.endDate > requirement.end_date) {
    throw new BusinessRuleError(
      `Assignment ${input.startDate} to ${input.endDate} falls outside the requirement's ` +
        `window (${requirement.start_date} to ${requirement.end_date})`,
    );
  }

  const range: DateRange = { startDate: input.startDate, endDate: input.endDate };
  const plannedWindows: TimeWindow[] = [
    { startTime: input.plannedStartTime, endTime: input.plannedEndTime },
  ];

  await assertAllSatisfied({
    tx,
    employeeId: input.employeeId,
    requirementId: input.requirementId,
    range,
    plannedWindows,
  });

  const inserted = await tx.queryOne<{ id: string }>(
    `INSERT INTO assignments
       (employee_id, requirement_id, start_date, end_date, planned_start_time, planned_end_time)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      input.employeeId,
      input.requirementId,
      input.startDate,
      input.endDate,
      input.plannedStartTime,
      input.plannedEndTime,
    ],
  );

  // Same transaction, so partial fulfilment is always queryable without
  // recomputing it from the assignments table.
  await tx.query(
    'UPDATE contract_requirements SET fulfilled_count = fulfilled_count + 1, updated_at = now() WHERE id = $1',
    [input.requirementId],
  );

  await recordAudit(
    {
      userId: actorId,
      action: 'CREATE_ASSIGNMENT',
      entityType: 'Assignment',
      entityId: inserted!.id,
      newValue: input,
    },
    tx,
  );

  return inserted!.id;
}

assignmentRouter.post(
  '/assignments',
  requirePermission('CREATE_ASSIGNMENT'),
  handler(async (req, res) => {
    const body = parseBody(assignmentSchema, req.body);
    const id = await withTransaction((tx) => createAssignment(tx, body, req.user!.id));
    return created(
      res,
      await queryOne(`SELECT ${assignmentColumns} ${assignmentFrom} WHERE a.id = $1`, [id]),
    );
  }),
);

assignmentRouter.post(
  '/assignments/bulk',
  requirePermission('CREATE_ASSIGNMENT'),
  handler(async (req, res) => {
    const { assignments } = parseBody(bulkSchema, req.body);

    // All-or-nothing: a batch that cannot be fully satisfied rolls back rather
    // than leaving a requirement half-staffed by an ambiguous partial result.
    const ids = await withTransaction(async (tx) => {
      const out: string[] = [];
      for (const item of assignments) {
        out.push(await createAssignment(tx, item, req.user!.id));
      }
      return out;
    });

    const rows = await query(
      `SELECT ${assignmentColumns} ${assignmentFrom} WHERE a.id = ANY($1::uuid[])`,
      [`{${ids.join(',')}}`],
    );
    return created(res, { created: rows.length, assignments: rows });
  }),
);

assignmentRouter.delete(
  '/assignments/:id',
  requirePermission('CANCEL_ASSIGNMENT'),
  handler(async (req, res) => {
    const id = param(req, 'id');

    await withTransaction(async (tx) => {
      const assignment = await tx.queryOne<{
        id: string;
        status: string;
        requirement_id: string;
      }>('SELECT id, status, requirement_id FROM assignments WHERE id = $1 FOR UPDATE', [id]);
      if (!assignment) throw new NotFoundError('Assignment', id);
      if (assignment.status === 'CANCELLED') {
        throw new BusinessRuleError('This assignment is already cancelled');
      }

      const logged = await tx.queryOne<{ count: string }>(
        `SELECT count(*) AS count FROM work_logs
          WHERE assignment_id = $1 AND status IN ('SUBMITTED', 'APPROVED')`,
        [id],
      );
      if (Number(logged?.count ?? 0) > 0) {
        throw new BusinessRuleError(
          `This assignment has ${logged!.count} submitted or approved work log(s) and cannot be cancelled. ` +
            'Approved work is a billing record.',
        );
      }

      await tx.query(
        `UPDATE assignments SET status = 'CANCELLED', updated_at = now() WHERE id = $1`,
        [id],
      );
      // Free the slot back up so the requirement can be re-staffed.
      await tx.query(
        `UPDATE contract_requirements
            SET fulfilled_count = greatest(fulfilled_count - 1, 0), updated_at = now()
          WHERE id = $1`,
        [assignment.requirement_id],
      );
      await recordAudit(
        {
          userId: req.user!.id,
          action: 'CANCEL_ASSIGNMENT',
          entityType: 'Assignment',
          entityId: id,
          oldValue: { status: 'ACTIVE' },
          newValue: { status: 'CANCELLED' },
        },
        tx,
      );
    });

    return ok(res, null, 'Assignment cancelled');
  }),
);

// ------------------------------------------------------------------ reads

assignmentRouter.get(
  '/requirements/:reqId/assignments',
  requirePermission('VIEW_ASSIGNMENTS'),
  handler(async (req, res) =>
    ok(
      res,
      await query(
        `SELECT ${assignmentColumns} ${assignmentFrom} WHERE a.requirement_id = $1 ORDER BY a.start_date`,
        [param(req, 'reqId')],
      ),
    ),
  ),
);

assignmentRouter.get(
  '/contracts/:contractId/assignments',
  requirePermission('VIEW_ASSIGNMENTS'),
  handler(async (req, res) =>
    ok(
      res,
      await query(
        `SELECT ${assignmentColumns} ${assignmentFrom} WHERE r.contract_id = $1 ORDER BY a.start_date`,
        [param(req, 'contractId')],
      ),
    ),
  ),
);

assignmentRouter.get(
  '/assignments/mine',
  handler(async (req, res) => {
    const { employeeId } = parseQuery(mineQuerySchema, req.query);
    // A contractor always reads their own, whatever id the client sent.
    const target = req.user!.employeeId ?? employeeId;
    if (!target) {
      throw new BusinessRuleError('This account is not linked to a contractor profile');
    }
    if (req.user!.employeeId && employeeId && employeeId !== req.user!.employeeId) {
      throw new BusinessRuleError('You can only view your own assignments');
    }
    return ok(
      res,
      await query(
        `SELECT ${assignmentColumns} ${assignmentFrom}
          WHERE a.employee_id = $1 AND a.status = 'ACTIVE' ORDER BY a.start_date DESC`,
        [target],
      ),
    );
  }),
);

/**
 * Candidates who pass the whole specification chain for a requirement.
 *
 * Runs the same chain the write path runs, so the list cannot contain someone
 * who would then be rejected on assignment — except for a genuine race, which
 * the write path catches and reports.
 */
assignmentRouter.get(
  '/requirements/:reqId/eligible-employees',
  requirePermission('CREATE_ASSIGNMENT', 'VIEW_ASSIGNMENTS'),
  handler(async (req, res) => {
    const requirementId = param(req, 'reqId');
    const { startDate, endDate } = parseQuery(eligibleQuerySchema, req.query);

    const requirement = await queryOne<{ start_date: string; end_date: string }>(
      'SELECT start_date, end_date FROM contract_requirements WHERE id = $1',
      [requirementId],
    );
    if (!requirement) throw new NotFoundError('Requirement', requirementId);

    const range: DateRange = {
      startDate: startDate ?? requirement.start_date,
      endDate: endDate ?? requirement.end_date,
    };

    const eligible = await withTransaction(async (tx) => {
      const candidates = await tx.query<{ id: string; name: string }>(
        `SELECT e.id, (e.first_name || ' ' || e.last_name) AS name
           FROM employees e WHERE e.active ORDER BY e.first_name, e.last_name`,
      );
      const out: { id: string; name: string }[] = [];
      for (const candidate of candidates) {
        const passes = await isSatisfied({
          tx,
          employeeId: candidate.id,
          requirementId,
          range,
          // No proposed hours: this filters on skill and status, and assignment
          // time re-checks capacity and collisions against the real window.
          plannedWindows: [],
        });
        if (passes) out.push(candidate);
      }
      return out;
    });

    const ids = eligible.map((e) => e.id);
    if (ids.length === 0) return ok(res, []);

    const employees = await query(
      `SELECT e.id, e.user_id AS "userId", e.first_name AS "firstName", e.last_name AS "lastName",
              e.email, e.phone, e.active, u.username
         FROM employees e JOIN users u ON u.id = e.user_id
        WHERE e.id = ANY($1::uuid[]) ORDER BY e.first_name, e.last_name`,
      [`{${ids.join(',')}}`],
    );
    return ok(res, employees);
  }),
);

/**
 * Proposes who to place in each open slot on a contract.
 *
 * Scoring is longest-idle-first: a contractor who has never had approved work
 * outranks everyone, then the one whose last approved work is oldest. Deliberately
 * ranked on *approved work*, never on assignment count, so someone repeatedly
 * assigned to work that never happened does not drift to the bottom.
 *
 * This only ranks and proposes. Writing goes through `createAssignment` like
 * everything else, so a suggestion still has to survive full validation.
 */
assignmentRouter.get(
  '/contracts/:contractId/suggest-assignments',
  requirePermission('CREATE_ASSIGNMENT'),
  handler(async (req, res) => {
    const contractId = param(req, 'contractId');

    const requirements = await query<{
      id: string;
      skill_name: string;
      required_employee_count: number;
      fulfilled_count: number;
      start_date: string;
      end_date: string;
      expected_hours_per_day: string;
    }>(
      `SELECT r.id, s.name AS skill_name, r.required_employee_count, r.fulfilled_count,
              r.start_date, r.end_date, r.expected_hours_per_day
         FROM contract_requirements r JOIN skills s ON s.id = r.skill_id
        WHERE r.contract_id = $1 ORDER BY s.name`,
      [contractId],
    );
    if (requirements.length === 0) throw new NotFoundError('Contract', contractId);

    const idleness = await query<{ id: string; name: string; last_worked: string | null }>(
      `SELECT e.id, (e.first_name || ' ' || e.last_name) AS name,
              max(wl.work_date) AS last_worked
         FROM employees e
         LEFT JOIN work_logs wl ON wl.employee_id = e.id AND wl.status = 'APPROVED'
        WHERE e.active
        GROUP BY e.id, e.first_name, e.last_name`,
    );
    const rankOf = new Map(
      idleness.map((r) => [r.id, { name: r.name, lastWorked: r.last_worked }]),
    );

    const suggestions = await withTransaction(async (tx) => {
      const out: unknown[] = [];
      // Claimed within this call, so one contractor is not proposed twice.
      const claimed = new Set<string>();

      for (const requirement of requirements) {
        const open = requirement.required_employee_count - requirement.fulfilled_count;
        const range: DateRange = {
          startDate: requirement.start_date,
          endDate: requirement.end_date,
        };

        const ranked: { id: string; name: string; score: number }[] = [];
        for (const [id, info] of rankOf) {
          if (claimed.has(id)) continue;
          const passes = await isSatisfied({
            tx,
            employeeId: id,
            requirementId: requirement.id,
            range,
            plannedWindows: [],
          });
          if (!passes) continue;
          // Never worked scores highest; otherwise older last-worked wins.
          const score = info.lastWorked
            ? Math.floor((Date.now() - new Date(info.lastWorked).getTime()) / 86_400_000)
            : 100_000;
          ranked.push({ id, name: info.name, score });
        }
        // Deterministic tie-break on id, so the same data yields the same plan.
        ranked.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

        for (let slot = 0; slot < open; slot++) {
          const pick = ranked[slot];
          if (pick) claimed.add(pick.id);
          out.push({
            requirementId: requirement.id,
            skillName: requirement.skill_name,
            slotIndex: slot,
            employeeId: pick?.id ?? null,
            employeeName: pick?.name ?? null,
            score: pick?.score ?? 0,
            status: pick ? 'SUGGESTED' : 'UNASSIGNABLE',
            startDate: requirement.start_date,
            endDate: requirement.end_date,
            plannedStartTime: '09:00:00',
            plannedEndTime: defaultEndTime(requirement.expected_hours_per_day),
          });
        }
      }
      return out;
    });

    return ok(res, suggestions);
  }),
);

/** A 09:00 start plus the requirement's expected hours, clamped to the day. */
function defaultEndTime(expectedHoursPerDay: string): string {
  const minutes = Math.min(9 * 60 + Math.round(Number(expectedHoursPerDay) * 60), 23 * 60 + 59);
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}:00`;
}
