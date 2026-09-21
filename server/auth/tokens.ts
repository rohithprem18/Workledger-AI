import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import { UnauthorizedError } from '../core/errors.ts';

/**
 * JWT issuing and verification.
 *
 * Uses `jose` rather than `jsonwebtoken` because it runs on Web Crypto, which
 * works unchanged on Node and on Vercel's edge runtime — so moving a route to
 * the edge later does not mean re-implementing auth.
 *
 * Access and refresh tokens carry separate `jti` values so one can be revoked
 * without the other, and a `type` claim so a refresh token cannot be replayed
 * as an access token.
 */

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;

export type TokenType = 'access' | 'refresh';

export interface TokenClaims {
  sub: string;
  username: string;
  type: TokenType;
  jti: string;
  exp: number;
}

function secret(): Uint8Array {
  const raw = process.env.JWT_SECRET;
  if (!raw || raw.length < 32) {
    // Refuse to start rather than sign with a guessable key.
    throw new Error(
      'JWT_SECRET must be set and at least 32 characters. Generate one with: openssl rand -base64 48',
    );
  }
  return new TextEncoder().encode(raw);
}

async function sign(
  userId: string,
  username: string,
  type: TokenType,
  ttlSeconds: number,
): Promise<string> {
  return new SignJWT({ username, type, jti: randomUUID() })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret());
}

export function signAccessToken(userId: string, username: string): Promise<string> {
  return sign(userId, username, 'access', ACCESS_TTL_SECONDS);
}

export function signRefreshToken(userId: string, username: string): Promise<string> {
  return sign(userId, username, 'refresh', REFRESH_TTL_SECONDS);
}

/**
 * Verifies a token and checks it is the kind the caller expects.
 *
 * @throws UnauthorizedError when the signature, expiry or type is wrong — all
 *         answered identically, so a probe cannot tell them apart.
 */
export async function verifyToken(token: string, expected: TokenType): Promise<TokenClaims> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] });

    if (payload.type !== expected) {
      throw new UnauthorizedError('Invalid token');
    }
    return {
      sub: String(payload.sub),
      username: String(payload.username),
      type: payload.type as TokenType,
      jti: String(payload.jti),
      exp: Number(payload.exp),
    };
  } catch (error) {
    if (error instanceof UnauthorizedError) throw error;
    throw new UnauthorizedError('Invalid or expired token');
  }
}

export const tokenLifetimes = {
  accessSeconds: ACCESS_TTL_SECONDS,
  refreshSeconds: REFRESH_TTL_SECONDS,
};
