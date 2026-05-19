import { Hono } from 'hono';
import { redactConfig } from '../../config/redact.js';
import type { GatewayConfig } from '../../config/schema.js';
import type { GatewayVariables } from '../../middleware/types.js';

export interface SystemInfoRoutesDeps {
  config: GatewayConfig;
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
    let isAdmin = false;
    try {
      const { listRoleBindings } = await import('../../middleware/authz/policy.engine.js');
      const bindings = await listRoleBindings();
      isAdmin = bindings.some((b) => b.user === subject && b.role === 'admin');
    } catch {
      isAdmin = false;
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
