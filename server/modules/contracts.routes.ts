import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction, type Tx } from '../db/pool.ts';
import { BusinessRuleError, NotFoundError } from '../core/errors.ts';
import { created, handler, ok, param, parseBody } from '../core/http.ts';
import { authenticate, requirePermission } from '../auth/middleware.ts';
import { recordAudit } from '../core/audit.ts';

/**
 * Client contracts and the staffing requirements under them.
 *
 * A requirement is the unit everything downstream hangs off: it carries the
 * authorised hourly rate, so it is what the invoice auditor reconciles billed
 * rates against, and it carries `fulfilled_count`, which assignment creation
 * keeps in step transactionally.
 */
export const contractRouter: Router = Router();
contractRouter.use(authenticate);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must look like 2026-04-01');

const requirementSchema = z.object({
  skillId: z.uuid('Skill is required'),
  requiredEmployeeCount: z.coerce.number().int().min(1, 'Headcount must be at least 1'),
  hourlyRate: z.coerce.number().gt(0, 'Hourly rate must be positive'),
  expectedHoursPerDay: z.coerce
    .number()
    .min(0.5, 'Expected hours must be at least 0.5')
    .max(24, 'Expected hours cannot exceed 24'),
  minProficiency: z.coerce.number().int().min(1).max(5).default(1),
  startDate: isoDate,
  endDate: isoDate,
});

const contractSchema = z.object({
  companyId: z.uuid('Client company is required'),
  title: z.string().trim().min(1, 'Title is required').max(255),
  description: z.string().trim().max(5000).nullish(),
  billingTypeId: z.uuid('Billing type is required'),
  startDate: isoDate,
  endDate: isoDate,
  requirements: z.array(requirementSchema).optional().default([]),
});

const contractColumns = `
  c.id, c.company_id AS "companyId", co.name AS "companyName", c.title, c.description,
  c.billing_type_id AS "billingTypeId", bt.code AS "billingTypeCode", bt.label AS "billingTypeLabel",
  c.start_date AS "startDate", c.end_date AS "endDate", c.active`;

const contractFrom = `
  FROM contracts c
  JOIN client_companies co ON co.id = c.company_id
  JOIN billing_types bt ON bt.id = c.billing_type_id`;

const requirementColumns = `
  r.id, r.skill_id AS "skillId", s.name AS "skillName",
  r.required_employee_count AS "requiredEmployeeCount", r.hourly_rate AS "hourlyRate",
  r.expected_hours_per_day AS "expectedHoursPerDay", r.min_proficiency AS "minProficiency",
  r.start_date AS "startDate", r.end_date AS "endDate", r.fulfilled_count AS "fulfilledCount",
  (r.required_employee_count - r.fulfilled_count) AS "remainingSlots"`;

export async function requirementsOf(contractId: string, tx?: Tx) {
  const run = tx ? tx.query.bind(tx) : query;
  return run(
    `SELECT ${requirementColumns}
       FROM contract_requirements r JOIN skills s ON s.id = r.skill_id
      WHERE r.contract_id = $1 ORDER BY s.name`,
    [contractId],
  );
}

/** Dates must be sane and requirements must sit inside the contract term. */
function assertDatesValid(
  startDate: string,
  endDate: string,
  requirements: { startDate: string; endDate: string }[],
): void {
  if (endDate < startDate) {
    throw new BusinessRuleError(
      `Contract ends (${endDate}) before it starts (${startDate})`,
    );
  }
  for (const r of requirements) {
    if (r.endDate < r.startDate) {
      throw new BusinessRuleError(
        `Requirement ends (${r.endDate}) before it starts (${r.startDate})`,
      );
    }
    if (r.startDate < startDate || r.endDate > endDate) {
      throw new BusinessRuleError(
        `Requirement ${r.startDate} to ${r.endDate} falls outside the contract term ` +
          `(${startDate} to ${endDate}). Work outside the term cannot be billed.`,
      );
    }
  }
}

contractRouter.get(
  '/contracts',
  requirePermission('VIEW_CONTRACTS'),
  handler(async (_req, res) => {
    const contracts = await query<{ id: string }>(
      `SELECT ${contractColumns} ${contractFrom} ORDER BY c.start_date DESC, c.title`,
    );
    const requirements = await query<{ contract_id: string }>(
      `SELECT r.contract_id, ${requirementColumns}
         FROM contract_requirements r JOIN skills s ON s.id = r.skill_id
        ORDER BY s.name`,
    );
    const byContract = new Map<string, unknown[]>();
    for (const row of requirements) {
      const { contract_id: contractId, ...rest } = row;
      if (!byContract.has(contractId)) byContract.set(contractId, []);
      byContract.get(contractId)!.push(rest);
    }
    return ok(
      res,
      contracts.map((c) => ({ ...c, requirements: byContract.get(c.id) ?? [] })),
    );
  }),
);

contractRouter.get(
  '/contracts/:id',
  requirePermission('VIEW_CONTRACTS'),
  handler(async (req, res) => {
    const id = param(req, 'id');
    const contract = await queryOne(`SELECT ${contractColumns} ${contractFrom} WHERE c.id = $1`, [
      id,
    ]);
    if (!contract) throw new NotFoundError('Contract', id);
    contract.requirements = await requirementsOf(id);
    return ok(res, contract);
  }),
);

contractRouter.get(
  '/companies/:companyId/contracts',
  requirePermission('VIEW_CONTRACTS'),
  handler(async (req, res) =>
    ok(
      res,
      await query(
        `SELECT ${contractColumns} ${contractFrom} WHERE c.company_id = $1 ORDER BY c.start_date DESC`,
        [param(req, 'companyId')],
      ),
    ),
  ),
);

contractRouter.post(
  '/contracts',
  requirePermission('CREATE_CONTRACT'),
  handler(async (req, res) => {
    const body = parseBody(contractSchema, req.body);
    assertDatesValid(body.startDate, body.endDate, body.requirements);

    if (!(await queryOne('SELECT 1 FROM client_companies WHERE id = $1', [body.companyId]))) {
      throw new NotFoundError('Client company', body.companyId);
    }
    if (!(await queryOne('SELECT 1 FROM billing_types WHERE id = $1', [body.billingTypeId]))) {
      throw new NotFoundError('Billing type', body.billingTypeId);
    }

    const id = await withTransaction(async (tx) => {
      const contract = await tx.queryOne<{ id: string }>(
        `INSERT INTO contracts (company_id, title, description, billing_type_id, start_date, end_date)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          body.companyId,
          body.title,
          body.description ?? null,
          body.billingTypeId,
          body.startDate,
          body.endDate,
        ],
      );
      for (const r of body.requirements) {
        await tx.query(
          `INSERT INTO contract_requirements
             (contract_id, skill_id, required_employee_count, hourly_rate,
              expected_hours_per_day, min_proficiency, start_date, end_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            contract!.id,
            r.skillId,
            r.requiredEmployeeCount,
            r.hourlyRate,
            r.expectedHoursPerDay,
            r.minProficiency,
            r.startDate,
            r.endDate,
          ],
        );
      }
      await recordAudit(
        {
          userId: req.user!.id,
          action: 'CREATE_CONTRACT',
          entityType: 'Contract',
          entityId: contract!.id,
          newValue: body,
        },
        tx,
      );
      return contract!.id;
    });

    const contract = await queryOne(`SELECT ${contractColumns} ${contractFrom} WHERE c.id = $1`, [
      id,
    ]);
    return created(res, { ...contract, requirements: await requirementsOf(id) });
  }),
);

// ---------------------------------------------------------- requirements

contractRouter.get(
  '/contracts/:contractId/requirements',
  requirePermission('VIEW_CONTRACTS'),
  handler(async (req, res) => ok(res, await requirementsOf(param(req, 'contractId')))),
);

contractRouter.get(
  '/requirements/:reqId',
  requirePermission('VIEW_CONTRACTS'),
  handler(async (req, res) => {
    const requirement = await queryOne(
      `SELECT ${requirementColumns}, r.contract_id AS "contractId"
         FROM contract_requirements r JOIN skills s ON s.id = r.skill_id
        WHERE r.id = $1`,
      [param(req, 'reqId')],
    );
    if (!requirement) throw new NotFoundError('Requirement', param(req, 'reqId'));
    return ok(res, requirement);
  }),
);

contractRouter.post(
  '/contracts/:contractId/requirements',
  requirePermission('CREATE_CONTRACT'),
  handler(async (req, res) => {
    const contractId = param(req, 'contractId');
    const body = parseBody(requirementSchema, req.body);

    const contract = await queryOne<{ start_date: string; end_date: string }>(
      'SELECT start_date, end_date FROM contracts WHERE id = $1',
      [contractId],
    );
    if (!contract) throw new NotFoundError('Contract', contractId);
    assertDatesValid(contract.start_date, contract.end_date, [body]);

    if (!(await queryOne('SELECT 1 FROM skills WHERE id = $1', [body.skillId]))) {
      throw new NotFoundError('Skill', body.skillId);
    }

    const inserted = await queryOne<{ id: string }>(
      `INSERT INTO contract_requirements
         (contract_id, skill_id, required_employee_count, hourly_rate,
          expected_hours_per_day, min_proficiency, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        contractId,
        body.skillId,
        body.requiredEmployeeCount,
        body.hourlyRate,
        body.expectedHoursPerDay,
        body.minProficiency,
        body.startDate,
        body.endDate,
      ],
    );
    await recordAudit({
      userId: req.user!.id,
      action: 'ADD_REQUIREMENT',
      entityType: 'ContractRequirement',
      entityId: inserted!.id,
      newValue: body,
    });

    const requirement = await queryOne(
      `SELECT ${requirementColumns} FROM contract_requirements r
         JOIN skills s ON s.id = r.skill_id WHERE r.id = $1`,
      [inserted!.id],
    );
    return created(res, requirement);
  }),
);
