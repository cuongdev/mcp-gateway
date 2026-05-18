import type { MiddlewareHandler } from 'hono';
import type { StorageAdapter } from '../../storage/adapter.js';
import { parseToken } from '../../identity/token.js';
import { toPrincipal } from '../../identity/principal.js';
import { verifySecret } from '../../utils/crypto.js';

export interface BearerTokenOptions {
  storage: StorageAdapter;
  /** Skip this middleware entirely. Used in dev mode where anonymous principal is injected upstream. */
  skip?: boolean;
}

function unauthorized(c: Parameters<MiddlewareHandler>[0], code: string, message: string, status: 401 | 403 = 401) {
  return c.json({ error: { code, message } }, status);
}

export function bearerTokenMiddleware(opts: BearerTokenOptions): MiddlewareHandler {
  return async (c, next) => {
    if (opts.skip) return next();

    // If an earlier auth middleware (e.g. session-cookie) already set a
    // principal, defer to it — bearer-token acts as a fallback only.
    if (c.get('principal')) return next();

    const header = c.req.header('Authorization') ?? c.req.header('authorization');
    if (!header) return unauthorized(c, 'missing_token', 'Authorization header required');

    const m = /^Bearer\s+(.+)$/i.exec(header);
    if (!m) return unauthorized(c, 'invalid_token', 'Bearer token required');

    const parsed = parseToken(m[1]);
    if (!parsed) return unauthorized(c, 'invalid_token', 'Token format invalid');

    const row = await opts.storage.tokens.findByPrefix(parsed.prefix);
    if (!row || !row.hash) return unauthorized(c, 'invalid_token', 'Token not found');

    const ok = await verifySecret(parsed.raw, row.hash);
    if (!ok) return unauthorized(c, 'invalid_token', 'Token mismatch');

    if (row.revokedAt) return unauthorized(c, 'token_revoked', 'Token has been revoked');
    if (row.expiresAt && row.expiresAt < Date.now()) {
      return unauthorized(c, 'token_expired', 'Token has expired');
    }

    const principalRow = await opts.storage.principals.findById(row.principalId);
    if (!principalRow) return unauthorized(c, 'invalid_token', 'Principal missing');
    if (principalRow.disabled) {
      return unauthorized(c, 'principal_disabled', 'Principal is disabled', 403);
    }

    const principal = toPrincipal(principalRow, 'token');
    c.set('principal', principal);
    c.set('authMethod', 'token');

    // fire-and-forget last_used update
    void opts.storage.tokens.updateLastUsed(row.id, Date.now()).catch(() => undefined);

    return next();
  };
}
