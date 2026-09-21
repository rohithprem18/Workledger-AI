import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../db/pool.js';
import { BusinessRuleError, NotFoundError } from '../core/errors.js';
import { created, handler, ok, param, parseBody } from '../core/http.js';
import { authenticate, requirePermission } from '../auth/middleware.js';
import { recordAudit } from '../core/audit.js';

/**
 * Contractor profiles, their skills, and their weekly availability pattern.
 *
 * An employee always has a login: creating one provisions the user account and
 * grants it the EMPLOYEE role in the same transaction, so there is never an
 * employee row that nobody can sign in as.
 */
export const employeeRouter: Router = Router();
employeeRouter.use(authenticate);

const EMPLOYEE_ROLE = 'EMPLOYEE';

const employeeColumns = `
  e.id, e.user_id AS "userId", e.first_name AS "firstName", e.last_name AS "lastName",
  e.email, e.phone, e.active, u.username`;

const createSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().min(1, 'Last name is required').max(100),
  email: z.email('Invalid email format'),
  phone: z.string().trim().max(20).nullish(),
  username: z.string().trim().min(3, 'Username is required').max(100),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const updateSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().min(1, 'Last name is required').max(100),
  phone: z.string().trim().max(20).nullish(),
});

const assignSkillSchema = z.object({
  skillId: z.guid('Skill id is required'),
  proficiencyLevel: z.coerce
    .number()
    .int()
    .min(1, 'Proficiency must be between 1 and 5')
    .max(5, 'Proficiency must be between 1 and 5'),
});

const timePattern = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const availabilitySchema = z.array(
  z.object({
    dayOfWeek: z.coerce
      .number()
      .int()
      .min(1, 'Day of week must be between 1 (Monday) and 7 (Sunday)')
      .max(7, 'Day of week must be between 1 (Monday) and 7 (Sunday)'),
    startTime: z.string().regex(timePattern, 'Start time must look like 09:00'),
    endTime: z.string().regex(timePattern, 'End time must look like 17:30'),
    maxHoursPerDay: z.coerce
      .number()
      .min(0.5, 'Max hours must be at least 0.5')
      .max(24, 'Max hours cannot exceed 24'),
  }),
);

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

async function skillsOf(employeeId: string) {
  return query(
    `SELECT s.id, s.name, s.description, es.proficiency_level AS "proficiencyLevel"
       FROM employee_skills es JOIN skills s ON s.id = es.skill_id
      WHERE es.employee_id = $1 ORDER BY s.name`,
    [employeeId],
  );
}

// ------------------------------------------------------------- employees

employeeRouter.get(
  '/employees',
  requirePermission('VIEW_EMPLOYEES'),
  handler(async (_req, res) => {
    const employees = await query<{ id: string }>(
      `SELECT ${employeeColumns} FROM employees e JOIN users u ON u.id = e.user_id
        ORDER BY e.first_name, e.last_name`,
    );
    // Skills for everyone in one query rather than N.
    const skills = await query<{ employee_id: string }>(
      `SELECT es.employee_id, s.id, s.name, s.description,
              es.proficiency_level AS "proficiencyLevel"
         FROM employee_skills es JOIN skills s ON s.id = es.skill_id
        ORDER BY s.name`,
    );
    const byEmployee = new Map<string, unknown[]>();
    for (const row of skills) {
      const { employee_id: employeeId, ...skill } = row;
      if (!byEmployee.has(employeeId)) byEmployee.set(employeeId, []);
      byEmployee.get(employeeId)!.push(skill);
    }
    return ok(
      res,
      employees.map((e) => ({ ...e, skills: byEmployee.get(e.id) ?? [] })),
    );
  }),
);

employeeRouter.get(
  '/employees/:id',
  requirePermission('VIEW_EMPLOYEES'),
  handler(async (req, res) => {
    const id = param(req, 'id');
    const employee = await queryOne(
      `SELECT ${employeeColumns} FROM employees e JOIN users u ON u.id = e.user_id WHERE e.id = $1`,
      [id],
    );
    if (!employee) throw new NotFoundError('Employee', id);
    employee.skills = await skillsOf(id);
    return ok(res, employee);
  }),
);

employeeRouter.post(
  '/employees',
  requirePermission('CREATE_EMPLOYEE'),
  handler(async (req, res) => {
    const body = parseBody(createSchema, req.body);

    const clash = await queryOne<{ username: string; email: string }>(
      'SELECT username, email FROM users WHERE lower(username) = lower($1) OR lower(email) = lower($2)',
      [body.username, body.email],
    );
    if (clash) {
      throw new BusinessRuleError(
        clash.username.toLowerCase() === body.username.toLowerCase()
          ? `Username "${body.username}" is taken`
          : `Email "${body.email}" is already registered`,
      );
    }

    const role = await queryOne<{ id: string }>('SELECT id FROM roles WHERE name = $1', [
      EMPLOYEE_ROLE,
    ]);
    if (!role) {
      throw new BusinessRuleError(
        `The ${EMPLOYEE_ROLE} role is missing. Run the database migrations.`,
      );
    }

    const hash = await bcrypt.hash(body.password, 10);
    const id = await withTransaction(async (tx) => {
      const user = await tx.queryOne<{ id: string }>(
        'INSERT INTO users (username, password_hash, email) VALUES ($1, $2, $3) RETURNING id',
        [body.username, hash, body.email],
      );
      await tx.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [
        user!.id,
        role.id,
      ]);
      const employee = await tx.queryOne<{ id: string }>(
        `INSERT INTO employees (user_id, first_name, last_name, email, phone)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [user!.id, body.firstName, body.lastName, body.email, body.phone ?? null],
      );
      await recordAudit(
        {
          userId: req.user!.id,
          action: 'CREATE_EMPLOYEE',
          entityType: 'Employee',
          entityId: employee!.id,
          newValue: {
            firstName: body.firstName,
            lastName: body.lastName,
            email: body.email,
            username: body.username,
          },
        },
        tx,
      );
      return employee!.id;
    });

    const employee = await queryOne(
      `SELECT ${employeeColumns} FROM employees e JOIN users u ON u.id = e.user_id WHERE e.id = $1`,
      [id],
    );
    return created(res, { ...employee, skills: [] });
  }),
);

employeeRouter.put(
  '/employees/:id',
  requirePermission('UPDATE_EMPLOYEE'),
  handler(async (req, res) => {
    const id = param(req, 'id');
    const body = parseBody(updateSchema, req.body);

    const before = await queryOne(
      `SELECT ${employeeColumns} FROM employees e JOIN users u ON u.id = e.user_id WHERE e.id = $1`,
      [id],
    );
    if (!before) throw new NotFoundError('Employee', id);

    await query(
      `UPDATE employees SET first_name = $2, last_name = $3, phone = $4, updated_at = now()
        WHERE id = $1`,
      [id, body.firstName, body.lastName, body.phone ?? null],
    );
    await recordAudit({
      userId: req.user!.id,
      action: 'UPDATE_EMPLOYEE',
      entityType: 'Employee',
      entityId: id,
      oldValue: before,
      newValue: body,
    });

    const after = await queryOne(
      `SELECT ${employeeColumns} FROM employees e JOIN users u ON u.id = e.user_id WHERE e.id = $1`,
      [id],
    );
    return ok(res, { ...after, skills: await skillsOf(id) });
  }),
);

employeeRouter.delete(
  '/employees/:id',
  requirePermission('DEACTIVATE_EMPLOYEE'),
  handler(async (req, res) => {
    const id = param(req, 'id');
    const employee = await queryOne<{ user_id: string; active: boolean }>(
      'SELECT user_id, active FROM employees WHERE id = $1',
      [id],
    );
    if (!employee) throw new NotFoundError('Employee', id);

    const active = await queryOne<{ count: string }>(
      `SELECT count(*) AS count FROM assignments WHERE employee_id = $1 AND status = 'ACTIVE'`,
      [id],
    );
    if (Number(active?.count ?? 0) > 0) {
      throw new BusinessRuleError(
        `This contractor has ${active!.count} active assignment(s). Cancel them before deactivating.`,
      );
    }

    // Deactivate the login too, so a deactivated contractor cannot sign in.
    await withTransaction(async (tx) => {
      await tx.query('UPDATE employees SET active = false, updated_at = now() WHERE id = $1', [id]);
      await tx.query('UPDATE users SET active = false, updated_at = now() WHERE id = $1', [
        employee.user_id,
      ]);
      await recordAudit(
        {
          userId: req.user!.id,
          action: 'DEACTIVATE_EMPLOYEE',
          entityType: 'Employee',
          entityId: id,
          oldValue: { active: true },
          newValue: { active: false },
        },
        tx,
      );
    });
    return ok(res, null, 'Contractor deactivated');
  }),
);

// ----------------------------------------------------------------- skills

employeeRouter.get(
  '/employees/:id/skills',
  requirePermission('VIEW_EMPLOYEES'),
  handler(async (req, res) => ok(res, await skillsOf(param(req, 'id')))),
);

employeeRouter.post(
  '/employees/:id/skills',
  requirePermission('CREATE_EMPLOYEE', 'UPDATE_EMPLOYEE', 'MANAGE_SKILLS'),
  handler(async (req, res) => {
    const employeeId = param(req, 'id');
    const body = parseBody(assignSkillSchema, req.body);

    if (!(await queryOne('SELECT 1 FROM employees WHERE id = $1', [employeeId]))) {
      throw new NotFoundError('Employee', employeeId);
    }
    if (!(await queryOne('SELECT 1 FROM skills WHERE id = $1', [body.skillId]))) {
      throw new NotFoundError('Skill', body.skillId);
    }

    // Re-assigning an existing skill updates the proficiency rather than failing.
    await query(
      `INSERT INTO employee_skills (employee_id, skill_id, proficiency_level)
       VALUES ($1, $2, $3)
       ON CONFLICT (employee_id, skill_id)
       DO UPDATE SET proficiency_level = EXCLUDED.proficiency_level, updated_at = now()`,
      [employeeId, body.skillId, body.proficiencyLevel],
    );
    await recordAudit({
      userId: req.user!.id,
      action: 'ASSIGN_SKILL',
      entityType: 'EmployeeSkill',
      entityId: employeeId,
      newValue: body,
    });
    return ok(res, await skillsOf(employeeId));
  }),
);

employeeRouter.delete(
  '/employees/:empId/skills/:skillId',
  requirePermission('CREATE_EMPLOYEE', 'UPDATE_EMPLOYEE', 'MANAGE_SKILLS'),
  handler(async (req, res) => {
    const empId = param(req, 'empId');
    const skillId = param(req, 'skillId');
    await query('DELETE FROM employee_skills WHERE employee_id = $1 AND skill_id = $2', [
      empId,
      skillId,
    ]);
    await recordAudit({
      userId: req.user!.id,
      action: 'REMOVE_SKILL',
      entityType: 'EmployeeSkill',
      entityId: empId,
      oldValue: { skillId },
    });
    return ok(res, await skillsOf(empId));
  }),
);

// ----------------------------------------------------------- availability

async function availabilityOf(employeeId: string) {
  const rows = await query<{ dayOfWeek: number }>(
    `SELECT id, day_of_week AS "dayOfWeek", start_time AS "startTime", end_time AS "endTime",
            max_hours_per_day AS "maxHoursPerDay"
       FROM employee_weekly_availability
      WHERE employee_id = $1 ORDER BY day_of_week`,
    [employeeId],
  );
  return rows.map((r) => ({ ...r, dayName: DAY_NAMES[r.dayOfWeek - 1] ?? null }));
}

employeeRouter.get(
  '/employees/:id/availability',
  handler(async (req, res) => {
    const id = param(req, 'id');
    // A contractor may always read their own; anyone else needs the permission.
    if (req.user!.employeeId !== id && !req.user!.permissions.includes('VIEW_EMPLOYEES')) {
      throw new NotFoundError('Employee', id);
    }
    return ok(res, await availabilityOf(id));
  }),
);

employeeRouter.put(
  '/employees/:id/availability',
  handler(async (req, res) => {
    const id = param(req, 'id');
    // Employees set their own pattern; managers may set it for anyone.
    const isSelf = req.user!.employeeId === id;
    if (!isSelf && !req.user!.permissions.includes('UPDATE_EMPLOYEE')) {
      throw new BusinessRuleError('You can only change your own availability');
    }

    const entries = parseBody(availabilitySchema, req.body);

    for (const entry of entries) {
      if (entry.endTime <= entry.startTime) {
        throw new BusinessRuleError(
          `${DAY_NAMES[entry.dayOfWeek - 1]}: end time must be after start time`,
        );
      }
    }
    const days = new Set(entries.map((e) => e.dayOfWeek));
    if (days.size !== entries.length) {
      throw new BusinessRuleError('Each day of the week may appear only once');
    }

    await withTransaction(async (tx) => {
      // The request states the complete weekly pattern, so replace it wholesale.
      await tx.query('DELETE FROM employee_weekly_availability WHERE employee_id = $1', [id]);
      for (const entry of entries) {
        await tx.query(
          `INSERT INTO employee_weekly_availability
             (employee_id, day_of_week, start_time, end_time, max_hours_per_day)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, entry.dayOfWeek, entry.startTime, entry.endTime, entry.maxHoursPerDay],
        );
      }
      await recordAudit(
        {
          userId: req.user!.id,
          action: 'SET_AVAILABILITY',
          entityType: 'EmployeeWeeklyAvailability',
          entityId: id,
          newValue: entries,
        },
        tx,
      );
    });

    return ok(res, await availabilityOf(id));
  }),
);
