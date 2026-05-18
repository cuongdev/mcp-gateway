// ============================================================
// OIDC Authentication Middleware
//
// Validates Bearer tokens or session cookies.
// Supports multiple OIDC providers simultaneously.
// Delegates to resolveUser() from auth.routes.ts.
//
// TODO(P1 / task-24): Unify with the new Principal model.
//   The OAuth2 callback in `routes/auth.routes.ts` currently issues a
//   session cookie whose payload is a `UserContext` (sub / email / roles).
//   That cookie is interpreted by `resolveUser()` here.
//
//   The new `sessionCookieMiddleware` (src/middleware/auth/session-cookie.middleware.ts)
//   reads a `{ pid: principalId }` cookie and resolves it to a Principal via
//   the storage layer.
//
//   Future integration steps:
//     1. On successful OIDC callback (auth.routes.ts → /callback/:id), do a
//        find-or-create on `principals`/`users` matched by
//        `oidc_subject + oidc_provider_id`. The PrincipalRepo would need a
//        new `findByOidc(subject, providerId)` method (and the migrations
//        already include a unique index on those columns).
//     2. Use `signSessionCookie({ principalId }, secret)` to issue the
//        unified cookie shape.
//     3. Retire this `createAuthMiddleware` factory in favor of the
//        unified pipeline (sessionCookie → bearerToken → dev-anonymous).
// ============================================================

import type { MiddlewareHandler } from "hono";
import type { GatewayConfig } from "../../config/schema.js";
import type { GatewayVariables } from "../types.js";
import { MissingTokenError, InvalidTokenError } from "../../types/errors.js";
import { resolveUser } from "../../routes/auth.routes.js";
import { logger } from "../../utils/logger.js";

const log = logger.child({ component: "oidc-auth" });

/**
 * Creates authentication middleware.
 * Accepts:
 *   - HttpOnly session cookie (from OIDC login flow)
 *   - Bearer token issued by /auth/token
 *   - Bearer token issued directly by any configured OIDC provider
 */
export function createAuthMiddleware(
  config: GatewayConfig
): MiddlewareHandler<{ Variables: GatewayVariables }> {
  const sessionSecret = config.session.secret!;
  const cookieName = config.session.cookieName;
  const providers = config.oidcProviders;

  return async (c, next) => {
    const user = await resolveUser(
      c.req.raw,
      sessionSecret,
      cookieName,
      providers
    );

    if (!user) {
      const hasAuth = c.req.header("authorization");
      const hasCookie = c.req.header("cookie")?.includes(cookieName);

      if (!hasAuth && !hasCookie) {
        throw new MissingTokenError();
      }
      throw new InvalidTokenError("Token is invalid or expired");
    }

    c.set("user", user);
    const ctx = c.get("gatewayCtx");
    if (ctx) ctx.user = user;

    log.debug({ sub: user.sub, roles: user.roles, issuer: user.issuer }, "User authenticated");

    await next();
  };
}

/** @deprecated Use createAuthMiddleware(config) with full config */
export function clearTokenCache() {
  // No-op — caching now handled per-request in resolveUser / jose
}
