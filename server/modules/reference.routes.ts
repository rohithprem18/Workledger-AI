import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/pool.ts';
import { BusinessRuleError, NotFoundError } from '../core/errors.ts';
import { created, handler, ok, param, parseBody } from '../core/http.ts';
import { authenticate, requirePermission } from '../auth/middleware.ts';
import { recordAudit } from '../core/audit.ts';

/**
 * Reference data: skills, client companies, billing types, permissions.
 *
 * Grouped because each is a thin table with no behaviour of its own — the
 * interesting rules all live in the modules that consume them.
 */
export const referenceRouter: Router = Router();
referenceRouter.use(authenticate);

// ---------------------------------------------------------------- skills

const skillSchema = z.object({
  name: z.string().trim().min(1, 'Skill name is required').max(100),
  description: z.string().trim().max(1000).optional().nullable(),
});

referenceRouter.get(
  '/skills',
  requirePermission('MANAGE_SKILLS', 'VIEW_EMPLOYEES', 'VIEW_CONTRACTS'),
  handler(async (_req, res) =>
    ok(res, await query('SELECT id, name, description FROM skills ORDER BY name')),
  ),
);

referenceRouter.post(
  '/skills',
  requirePermission('MANAGE_SKILLS'),
  handler(async (req, res) => {
    const body = parseBody(skillSchema, req.body);

    const clash = await queryOne('SELECT 1 FROM skills WHERE lower(name) = lower($1)', [body.name]);
    if (clash) {
      throw new BusinessRuleError(`A skill named "${body.name}" already exists`);
    }

    const skill = await queryOne(
      'INSERT INTO skills (name, description) VALUES ($1, $2) RETURNING id, name, description',
      [body.name, body.description ?? null],
    );
    await recordAudit({
      userId: req.user!.id,
      action: 'CREATE_SKILL',
      entityType: 'Skill',
      entityId: skill!.id as string,
      newValue: skill,
    });
    return created(res, skill);
  }),
);

// ------------------------------------------------------------- companies

const companySchema = z.object({
  name: z.string().trim().min(1, 'Company name is required').max(255),
  contactEmail: z.email('Must be a valid email').nullish(),
  contactPhone: z.string().trim().max(20).nullish(),
  address: z.string().trim().max(2000).nullish(),
});

const companyColumns =
  'id, name, contact_email AS "contactEmail", contact_phone AS "contactPhone", address, active';

referenceRouter.get(
  '/companies',
  requirePermission('VIEW_COMPANIES'),
  handler(async (_req, res) =>
    ok(res, await query(`SELECT ${companyColumns} FROM client_companies ORDER BY name`)),
  ),
);

referenceRouter.post(
  '/companies',
  requirePermission('CREATE_COMPANY'),
  handler(async (req, res) => {
    const body = parseBody(companySchema, req.body);

    const clash = await queryOne('SELECT 1 FROM client_companies WHERE lower(name) = lower($1)', [
      body.name,
    ]);
    if (clash) {
      throw new BusinessRuleError(`A client named "${body.name}" already exists`);
    }

    const company = await queryOne(
      `INSERT INTO client_companies (name, contact_email, contact_phone, address)
       VALUES ($1, $2, $3, $4) RETURNING ${companyColumns}`,
      [body.name, body.contactEmail ?? null, body.contactPhone ?? null, body.address ?? null],
    );
    await recordAudit({
      userId: req.user!.id,
      action: 'CREATE_COMPANY',
      entityType: 'ClientCompany',
      entityId: company!.id as string,
      newValue: company,
    });
    return created(res, company);
  }),
);

referenceRouter.put(
  '/companies/:id',
  requirePermission('UPDATE_COMPANY'),
  handler(async (req, res) => {
    const body = parseBody(companySchema, req.body);
    const id = param(req, 'id');

    const before = await queryOne(`SELECT ${companyColumns} FROM client_companies WHERE id = $1`, [
      id,
    ]);
    if (!before) throw new NotFoundError('Client company', id);

    const after = await queryOne(
      `UPDATE client_companies
          SET name = $2, contact_email = $3, contact_phone = $4, address = $5, updated_at = now()
        WHERE id = $1 RETURNING ${companyColumns}`,
      [id, body.name, body.contactEmail ?? null, body.contactPhone ?? null, body.address ?? null],
    );
    await recordAudit({
      userId: req.user!.id,
      action: 'UPDATE_COMPANY',
      entityType: 'ClientCompany',
      entityId: id,
      oldValue: before,
      newValue: after,
    });
    return ok(res, after);
  }),
);

// --------------------------------------------------------- billing types

referenceRouter.get(
  '/billing-types',
  requirePermission('VIEW_CONTRACTS', 'CREATE_CONTRACT'),
  handler(async (_req, res) =>
    ok(
      res,
      await query(
        'SELECT id, code, label, active FROM billing_types WHERE active ORDER BY label',
      ),
    ),
  ),
);

// ----------------------------------------------------------- permissions

referenceRouter.get(
  '/permissions',
  requirePermission('MANAGE_ROLES', 'MANAGE_USERS'),
  handler(async (_req, res) =>
    ok(res, await query('SELECT id, code, description FROM permissions ORDER BY code')),
  ),
);
