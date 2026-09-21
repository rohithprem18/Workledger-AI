import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { query, queryOne } from '../db/pool.js';
import { ForbiddenError, UnauthorizedError } from '../core/errors.js';
import { verifyToken } from './tokens.js';

/** The authenticated caller, attached to the request once identified. */
export interface AuthUser {
  id: string;
  username: string;
  roles: string[];
  permissions: string[];
  employeeId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Loads the caller's roles and permissions.
 *
 * Read on every request rather than baked into the token: a permission change
 * or a deactivated account takes effect immediately, instead of lingering until
 * an access token expires. Both sides of the RBAC join are cheap indexed lookups.
 */
export async function loadAuthUser(userId: string): Promise<AuthUser | null> {
  const user = await queryOne<{ id: string; username: string; active: boolean }>(
    'SELECT id, username, active FROM users WHERE id = $1',
    [userId],
  );
  if (!user || !user.active) {
    return null;
  }

  const rows = await query<{ role: string; permission: string | null }>(
    `SELECT r.name AS role, p.code AS permission
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = $1`,
    [userId],
  );

  const employee = await queryOne<{ id: string }>(
    'SELECT id FROM employees WHERE user_id = $1',
    [userId],
  );

  return {
    id: user.id,
    username: user.username,
    roles: [...new Set(rows.map((r) => r.role))],
    permissions: [...new Set(rows.map((r) => r.permission).filter((p): p is string => !!p))],
    employeeId: employee?.id ?? null,
  };
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

/** Rejects the request unless it carries a valid, non-revoked access token. */
export const authenticate: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const token = bearerToken(req);
      if (!token) throw new UnauthorizedError();

      const claims = await verifyToken(token, 'access');

      // Logout blacklists a jti until its natural expiry.
      const revoked = await queryOne('SELECT 1 FROM token_blacklist WHERE token_jti = $1', [
        claims.jti,
      ]);
      if (revoked) throw new UnauthorizedError('This session has been signed out');

      const user = await loadAuthUser(claims.sub);
      if (!user) throw new UnauthorizedError('Account is inactive or no longer exists');

      req.user = user;
      next();
    } catch (error) {
      next(error);
    }
  })();
};

/**
 * Authorises on a *permission*, never a role name.
 *
 * This is what makes the RBAC table-driven: granting a new role the right
 * permissions makes every endpoint work for it with no code change, which is
 * the whole point of storing roles as data.
 */
export function requirePermission(...permissions: string[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      next(new UnauthorizedError());
      return;
    }
    const allowed = permissions.some((p) => user.permissions.includes(p));
    next(allowed ? undefined : new ForbiddenError(permissions.join(' or ')));
  };
}
