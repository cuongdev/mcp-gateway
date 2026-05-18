// ============================================================
// OIDC Authentication Middleware
//
// Validates Bearer tokens or session cookies.
// Supports multiple OIDC providers simultaneously.
// Delegates to resolveUser() from auth.routes.ts.
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
