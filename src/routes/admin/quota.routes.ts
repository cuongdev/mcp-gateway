import { Hono } from 'hono';
import type { QuotaService } from '../../quota/index.js';
import type { GatewayVariables } from '../../middleware/types.js';

export interface QuotaRoutesDeps { quota: QuotaService; }

export function createQuotaRoutes(deps: QuotaRoutesDeps) {
  const app = new Hono<{ Variables: GatewayVariables }>();
  app.get('/status', async (c) => {
    const p = c.get('principal');
    if (!p) return c.json({ error: { code: 'unauthenticated' } }, 401);
    const status = await deps.quota.getStatus(p.id, p.type);
    return c.json(status);
  });
  return app;
}
