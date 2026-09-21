import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, queryOne } from '../db/pool.ts';
import { RateLimitError, UnauthorizedError } from '../core/errors.ts';
import { handler, ok, parseBody } from '../core/http.ts';
import { authenticate, loadAuthUser } from './middleware.ts';
import { signAccessToken, signRefreshToken, verifyToken } from './tokens.ts';

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({ refreshToken: z.string().min(1) });
const logoutSchema = z.object({ token: z.string().min(1).optional() });

/**
 * Login throttling, per username+IP.
 *
 * In-memory, which on a serverless runtime means per-instance rather than
 * global — it raises the cost of online guessing without pretending to be a
 * distributed limiter. A real deployment under attack wants the bucket in
 * Postgres or Redis; this is honest about being a speed bump.
 */
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = Number(process.env.LOGIN_RATE_LIMIT ?? 20);
const WINDOW_MS = 60_000;

function checkRateLimit(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) {
    throw new RateLimitError('Too many sign-in attempts. Try again in a minute.');
  }
}

export const authRouter: Router = Router();

authRouter.post(
  '/login',
  handler(async (req, res) => {
    const { username, password } = parseBody(loginSchema, req.body);
    checkRateLimit(`${username}:${req.ip ?? 'unknown'}`);

    const user = await queryOne<{
      id: string;
      username: string;
      password_hash: string;
      active: boolean;
    }>('SELECT id, username, password_hash, active FROM users WHERE username = $1', [username]);

    // Compare against a dummy hash when the user is unknown, so a missing
    // account and a wrong password take the same time to answer.
    const hash = user?.password_hash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const matches = await bcrypt.compare(password, hash);

    if (!user || !user.active || !matches) {
      throw new UnauthorizedError('Invalid username or password');
    }

    const authUser = await loadAuthUser(user.id);
    if (!authUser) throw new UnauthorizedError('Invalid username or password');

    const [token, refreshToken] = await Promise.all([
      signAccessToken(user.id, user.username),
      signRefreshToken(user.id, user.username),
    ]);

    return ok(res, {
      token,
      refreshToken,
      username: authUser.username,
      employeeId: authUser.employeeId,
      roles: authUser.roles,
      permissions: authUser.permissions,
    });
  }),
);

authRouter.post(
  '/refresh',
  handler(async (req, res) => {
    const { refreshToken } = parseBody(refreshSchema, req.body);
    const claims = await verifyToken(refreshToken, 'refresh');

    const revoked = await queryOne('SELECT 1 FROM token_blacklist WHERE token_jti = $1', [
      claims.jti,
    ]);
    if (revoked) throw new UnauthorizedError('This session has been signed out');

    const authUser = await loadAuthUser(claims.sub);
    if (!authUser) throw new UnauthorizedError('Account is inactive or no longer exists');

    const [token, nextRefresh] = await Promise.all([
      signAccessToken(authUser.id, authUser.username),
      signRefreshToken(authUser.id, authUser.username),
    ]);

    // Rotate: the presented refresh token is burned so it cannot be replayed.
    await query(
      `INSERT INTO token_blacklist (token_jti, username, expires_at)
       VALUES ($1, $2, to_timestamp($3)) ON CONFLICT (token_jti) DO NOTHING`,
      [claims.jti, authUser.username, claims.exp],
    );

    return ok(res, {
      token,
      refreshToken: nextRefresh,
      username: authUser.username,
      employeeId: authUser.employeeId,
      roles: authUser.roles,
      permissions: authUser.permissions,
    });
  }),
);

authRouter.post(
  '/logout',
  authenticate,
  handler(async (req, res) => {
    const body = parseBody(logoutSchema, req.body ?? {});
    const header = req.headers.authorization?.slice(7).trim();
    const raw = body.token ?? header;

    if (raw) {
      // Best effort: a token we cannot read is already unusable.
      try {
        const claims = await verifyToken(raw, 'access');
        await query(
          `INSERT INTO token_blacklist (token_jti, username, expires_at)
           VALUES ($1, $2, to_timestamp($3)) ON CONFLICT (token_jti) DO NOTHING`,
          [claims.jti, claims.username, claims.exp],
        );
      } catch {
        // ignore
      }
    }
    return ok(res, null, 'Signed out');
  }),
);

authRouter.get(
  '/me',
  authenticate,
  handler(async (req, res) => ok(res, req.user)),
);
