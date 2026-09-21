import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../db/pool.ts';
import { BusinessRuleError, NotFoundError } from '../core/errors.ts';
import { created, handler, ok, param, parseBody } from '../core/http.ts';
import { authenticate, requirePermission } from '../auth/middleware.ts';
import { recordAudit } from '../core/audit.ts';

/**
 * Role and user administration.
 *
 * Roles and permissions are rows, not code: granting a new role the right
 * permission codes makes every endpoint work for it immediately, because
 * authorisation checks permissions rather than role names.
 */
export const rbacRouter: Router = Router();
rbacRouter.use(authenticate);

// ------------------------------------------------------------------ roles

const uuid = z.uuid('Must be a valid id');

const roleCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Role name is required')
    .max(50)
    .regex(/^[A-Z][A-Z0-9_]*$/, 'Role names are upper snake case, e.g. FINANCE_MANAGER'),
  description: z.string().trim().max(1000).nullish(),
  permissionIds: z.array(uuid).default([]),
});

const roleUpdateSchema = roleCreateSchema.pick({ name: true, description: true });
const permissionsUpdateSchema = z.object({ permissionIds: z.array(uuid) });

async function roleWithPermissions(id: string) {
  const role = await queryOne('SELECT id, name, description FROM roles WHERE id = $1', [id]);
  if (!role) return null;
  role.permissions = await query(
    `SELECT p.id, p.code, p.description
       FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = $1 ORDER BY p.code`,
    [id],
  );
  return role;
}

rbacRouter.get(
  '/roles',
  requirePermission('MANAGE_ROLES', 'MANAGE_USERS'),
  handler(async (_req, res) => {
    const roles = await query<{ id: string }>(
      'SELECT id, name, description FROM roles ORDER BY name',
    );
    const permissions = await query<{ role_id: string; id: string; code: string }>(
      `SELECT rp.role_id, p.id, p.code, p.description
         FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
        ORDER BY p.code`,
    );
    // One query for all permissions rather than one per role.
    const byRole = new Map<string, unknown[]>();
    for (const p of permissions) {
      const { role_id: roleId, ...rest } = p;
      if (!byRole.has(roleId)) byRole.set(roleId, []);
      byRole.get(roleId)!.push(rest);
    }
    return ok(
      res,
      roles.map((r) => ({ ...r, permissions: byRole.get(r.id) ?? [] })),
    );
  }),
);

rbacRouter.post(
  '/roles',
  requirePermission('MANAGE_ROLES'),
  handler(async (req, res) => {
    const body = parseBody(roleCreateSchema, req.body);

    if (await queryOne('SELECT 1 FROM roles WHERE upper(name) = upper($1)', [body.name])) {
      throw new BusinessRuleError(`A role named ${body.name} already exists`);
    }

    const role = await withTransaction(async (tx) => {
      const inserted = await tx.queryOne<{ id: string }>(
        'INSERT INTO roles (name, description) VALUES ($1, $2) RETURNING id',
        [body.name, body.description ?? null],
      );
      for (const permissionId of body.permissionIds) {
        await tx.query(
          'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [inserted!.id, permissionId],
        );
      }
      await recordAudit(
        {
          userId: req.user!.id,
          action: 'CREATE_ROLE',
          entityType: 'Role',
          entityId: inserted!.id,
          newValue: body,
        },
        tx,
      );
      return inserted!.id;
    });

    return created(res, await roleWithPermissions(role));
  }),
);

rbacRouter.put(
  '/roles/:id',
  requirePermission('MANAGE_ROLES'),
  handler(async (req, res) => {
    const id = param(req, 'id');
    const body = parseBody(roleUpdateSchema, req.body);

    const before = await roleWithPermissions(id);
    if (!before) throw new NotFoundError('Role', id);

    await query('UPDATE roles SET name = $2, description = $3, updated_at = now() WHERE id = $1', [
      id,
      body.name,
      body.description ?? null,
    ]);
    await recordAudit({
      userId: req.user!.id,
      action: 'UPDATE_ROLE',
      entityType: 'Role',
      entityId: id,
      oldValue: before,
      newValue: body,
    });
    return ok(res, await roleWithPermissions(id));
  }),
);

rbacRouter.put(
  '/roles/:id/permissions',
  requirePermission('MANAGE_ROLES'),
  handler(async (req, res) => {
    const id = param(req, 'id');
    const { permissionIds } = parseBody(permissionsUpdateSchema, req.body);

    const before = await roleWithPermissions(id);
    if (!before) throw new NotFoundError('Role', id);

    await withTransaction(async (tx) => {
      // Replace wholesale: the request states the complete desired set.
      await tx.query('DELETE FROM role_permissions WHERE role_id = $1', [id]);
      for (const permissionId of permissionIds) {
        await tx.query(
          'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [id, permissionId],
        );
      }
      await recordAudit(
        {
          userId: req.user!.id,
          action: 'UPDATE_ROLE_PERMISSIONS',
          entityType: 'Role',
          entityId: id,
          oldValue: before.permissions,
          newValue: permissionIds,
        },
        tx,
      );
    });

    return ok(res, await roleWithPermissions(id));
  }),
);

rbacRouter.delete(
  '/roles/:id',
  requirePermission('MANAGE_ROLES'),
  handler(async (req, res) => {
    const id = param(req, 'id');
    const role = await roleWithPermissions(id);
    if (!role) throw new NotFoundError('Role', id);

    const inUse = await queryOne<{ count: string }>(
      'SELECT count(*) AS count FROM user_roles WHERE role_id = $1',
      [id],
    );
    if (Number(inUse?.count ?? 0) > 0) {
      throw new BusinessRuleError(
        `${role.name as string} is assigned to ${inUse!.count} user(s). Reassign them before deleting the role.`,
      );
    }

    await withTransaction(async (tx) => {
      await tx.query('DELETE FROM role_permissions WHERE role_id = $1', [id]);
      await tx.query('DELETE FROM roles WHERE id = $1', [id]);
      await recordAudit(
        {
          userId: req.user!.id,
          action: 'DELETE_ROLE',
          entityType: 'Role',
          entityId: id,
          oldValue: role,
        },
        tx,
      );
    });
    return ok(res, null, `Role ${role.name as string} deleted`);
  }),
);

// ------------------------------------------------------------------ users

const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[0-9]/, 'Password must contain a digit')
  .regex(/[^A-Za-z0-9]/, 'Password must contain a special character')
  .refine((v) => !/\s/.test(v), 'Password must not contain whitespace');

const userCreateSchema = z.object({
  username: z.string().trim().min(3).max(100),
  email: z.email('Must be a valid email'),
  password: passwordSchema,
  roleIds: z.array(uuid).min(1, 'A user needs at least one role'),
});

const rolesUpdateSchema = z.object({ roleIds: z.array(uuid).min(1, 'A user needs at least one role') });
const passwordResetSchema = z.object({ password: passwordSchema });

const userSelect = `
  SELECT u.id, u.username, u.email, u.active,
         coalesce(array_agg(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS "roleNames",
         coalesce(array_agg(r.id   ORDER BY r.name) FILTER (WHERE r.id   IS NOT NULL), '{}') AS "roleIds"
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id`;

rbacRouter.get(
  '/users',
  requirePermission('MANAGE_USERS'),
  handler(async (_req, res) =>
    ok(res, await query(`${userSelect} GROUP BY u.id ORDER BY u.username`)),
  ),
);

rbacRouter.post(
  '/users',
  requirePermission('MANAGE_USERS'),
  handler(async (req, res) => {
    const body = parseBody(userCreateSchema, req.body);

    const clash = await queryOne(
      'SELECT username, email FROM users WHERE lower(username) = lower($1) OR lower(email) = lower($2)',
      [body.username, body.email],
    );
    if (clash) {
      throw new BusinessRuleError(
        clash.username === body.username
          ? `Username "${body.username}" is taken`
          : `Email "${body.email}" is already registered`,
      );
    }

    const hash = await bcrypt.hash(body.password, 10);
    const id = await withTransaction(async (tx) => {
      const user = await tx.queryOne<{ id: string }>(
        'INSERT INTO users (username, password_hash, email) VALUES ($1, $2, $3) RETURNING id',
        [body.username, hash, body.email],
      );
      for (const roleId of body.roleIds) {
        await tx.query(
          'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [user!.id, roleId],
        );
      }
      await recordAudit(
        {
          userId: req.user!.id,
          action: 'CREATE_USER',
          entityType: 'User',
          entityId: user!.id,
          // Never the password, not even hashed, in an audit row.
          newValue: { username: body.username, email: body.email, roleIds: body.roleIds },
        },
        tx,
      );
      return user!.id;
    });

    return created(res, await queryOne(`${userSelect} WHERE u.id = $1 GROUP BY u.id`, [id]));
  }),
);

rbacRouter.put(
  '/users/:id/roles',
  requirePermission('MANAGE_USERS'),
  handler(async (req, res) => {
    const id = param(req, 'id');
    const { roleIds } = parseBody(rolesUpdateSchema, req.body);

    const before = await queryOne(`${userSelect} WHERE u.id = $1 GROUP BY u.id`, [id]);
    if (!before) throw new NotFoundError('User', id);

    await withTransaction(async (tx) => {
      await tx.query('DELETE FROM user_roles WHERE user_id = $1', [id]);
      for (const roleId of roleIds) {
        await tx.query(
          'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [id, roleId],
        );
      }
      await recordAudit(
        {
          userId: req.user!.id,
          action: 'UPDATE_USER_ROLES',
          entityType: 'User',
          entityId: id,
          oldValue: before.roleIds,
          newValue: roleIds,
        },
        tx,
      );
    });

    return ok(res, await queryOne(`${userSelect} WHERE u.id = $1 GROUP BY u.id`, [id]));
  }),
);

rbacRouter.put(
  '/users/:id/deactivate',
  requirePermission('MANAGE_USERS'),
  handler(async (req, res) => {
    const id = param(req, 'id');
    if (id === req.user!.id) {
      throw new BusinessRuleError('You cannot deactivate your own account');
    }
    const user = await queryOne(`${userSelect} WHERE u.id = $1 GROUP BY u.id`, [id]);
    if (!user) throw new NotFoundError('User', id);

    await query('UPDATE users SET active = false, updated_at = now() WHERE id = $1', [id]);
    await recordAudit({
      userId: req.user!.id,
      action: 'DEACTIVATE_USER',
      entityType: 'User',
      entityId: id,
      oldValue: { active: true },
      newValue: { active: false },
    });
    return ok(res, await queryOne(`${userSelect} WHERE u.id = $1 GROUP BY u.id`, [id]));
  }),
);

rbacRouter.post(
  '/users/:id/reset-password',
  requirePermission('MANAGE_USERS'),
  handler(async (req, res) => {
    const id = param(req, 'id');
    const { password } = parseBody(passwordResetSchema, req.body);

    if (!(await queryOne('SELECT 1 FROM users WHERE id = $1', [id]))) {
      throw new NotFoundError('User', id);
    }

    await query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [
      id,
      await bcrypt.hash(password, 10),
    ]);
    // The new password is deliberately absent from the audit row.
    await recordAudit({
      userId: req.user!.id,
      action: 'RESET_USER_PASSWORD',
      entityType: 'User',
      entityId: id,
    });
    return ok(res, null, 'Password reset');
  }),
);
