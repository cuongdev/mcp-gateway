import { Hono } from 'hono';
import { redactConfig } from '../../config/redact.js';
import type { GatewayConfig } from '../../config/schema.js';

export interface SystemInfoRoutesDeps {
  config: GatewayConfig;
}

/**
 * GET /api/system/info — returns the running gateway config with all
 * secret fields replaced by `***`. Consumed by the dashboard Settings
 * page; never include this response in client-side bug reports.
 */
export function createSystemInfoRoutes(deps: SystemInfoRoutesDeps) {
  const app = new Hono();
  app.get('/', (c) => {
    return c.json({
      version: process.env.npm_package_version ?? null,
      startedAt: process.env.MCP_STARTED_AT ?? null,
      config: redactConfig(deps.config),
    });
  });
  return app;
}
