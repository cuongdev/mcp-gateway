import { Hono } from 'hono';
import { z } from 'zod';
import type { ToolCache } from '../../cache/interface.js';

export interface CacheRoutesDeps {
  cache: ToolCache;
}

export function createCacheRoutes(deps: CacheRoutesDeps) {
  const app = new Hono();

  app.post('/invalidate', async (c) => {
    const body = z.object({
      tool: z.string().optional(),
      principal: z.string().optional(),
    }).parse(await c.req.json());

    let n = 0;
    if (body.tool) n += await deps.cache.invalidateTool(body.tool);
    if (body.principal) n += await deps.cache.invalidatePrincipal(body.principal);
    return c.json({ ok: true, invalidated: n });
  });

  return app;
}
