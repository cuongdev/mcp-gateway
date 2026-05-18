// ============================================================
// Session Cookie Middleware
//
// Reads a signed JWT cookie (HS256 via `jose`), verifies it,
// looks up the principal, and populates `c.var.principal`.
// On absent/invalid/expired cookie, passes through (bearer-token
// middleware may still match).
// ============================================================

import type { MiddlewareHandler } from 'hono';
import { jwtVerify, SignJWT } from 'jose';
import type { StorageAdapter } from '../../storage/adapter.js';
import { toPrincipal } from '../../identity/principal.js';

export interface SessionCookieOptions {
  storage: StorageAdapter;
  secret: Uint8Array;
  cookieName: string;
  /** TTL in seconds (default 8h) — used by `signSessionCookie` only */
  ttlSeconds?: number;
}

/**
 * Sign a session cookie JWT carrying the principal id under the `pid` claim.
 */
export async function signSessionCookie(
  payload: { principalId: string },
  secret: Uint8Array,
  ttlSeconds = 8 * 60 * 60,
): Promise<string> {
  return new SignJWT({ pid: payload.principalId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(secret);
}

/**
 * Hono middleware that authenticates a request via a signed session cookie.
 *
 * Behavior:
 *   - No cookie  → pass through (next middleware can attempt auth)
 *   - Bad cookie → pass through (don't 401 — let bearer-token try)
 *   - Valid + principal exists + not disabled → sets `principal` + `authMethod=oidc`
 */
export function sessionCookieMiddleware(opts: SessionCookieOptions): MiddlewareHandler {
  return async (c, next) => {
    const cookieHeader = c.req.header('cookie') ?? c.req.header('Cookie');
    if (!cookieHeader) return next();

    const cookies = parseCookies(cookieHeader);
    const token = cookies[opts.cookieName];
    if (!token) return next();

    try {
      const { payload } = await jwtVerify(token, opts.secret, { algorithms: ['HS256'] });
      const principalId = payload.pid as string | undefined;
      if (!principalId) return next();

      const row = await opts.storage.principals.findById(principalId);
      if (!row || row.disabled) return next();

      c.set('principal', toPrincipal(row, 'oidc'));
      c.set('authMethod', 'oidc');
    } catch {
      // Invalid / expired cookie → pass through; bearer-token middleware may still run
    }
    return next();
  };
}

function parseCookies(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}
