import { Hono } from 'hono';
import { redactConfig } from '../../config/redact.js';
import type { GatewayConfig } from '../../config/schema.js';
import type { GatewayVariables } from '../../middleware/types.js';
import type { PolicyEngine } from '../../middleware/authz/policy.engine.js';

export interface SystemInfoRoutesDeps {
  config: GatewayConfig;
  policyEngine: PolicyEngine;
}

/**
 * GET /api/system/info — returns the running gateway config with all
 * secret fields replaced by `***`. Admin-only.
 */
export function createSystemInfoRoutes(deps: SystemInfoRoutesDeps) {
  const app = new Hono<{ Variables: GatewayVariables }>();
  app.get('/', async (c) => {
    const principal = c.get('principal');
    if (!principal) {
      return c.json({ error: { code: 'unauthenticated' } }, 401);
    }
    const subject = principal.email ?? principal.id;
    // When authorization is disabled the gateway is "no auth, full access"
    // (the default local-dev setup): there are no role bindings to check, so
    // treat the caller as admin rather than 403'ing every admin endpoint.
    // When authz IS enabled, enforce the admin role binding even in dev mode.
    let isAdmin = deps.config.authorization.enabled === false;
    if (!isAdmin) {
      try {
        const bindings = await deps.policyEngine.listRoleBindings();
        isAdmin = bindings.some((b) => b.user === subject && b.role === 'admin');
      } catch {
        isAdmin = false;
      }
    }
    if (!isAdmin) {
      return c.json({ error: { code: 'forbidden', message: 'Admin role required' } }, 403);
    }
    return c.json({
      version: process.env.npm_package_version ?? null,
      startedAt: process.env.MCP_STARTED_AT ?? null,
      config: redactConfig(deps.config),
    });
  });
  return app;
}
