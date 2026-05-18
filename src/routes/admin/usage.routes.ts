import { Hono } from 'hono';
import { z } from 'zod';
import type { StorageAdapter } from '../../storage/adapter.js';

export interface UsageRoutesDeps {
  storage: StorageAdapter;
}

export function createUsageRoutes(deps: UsageRoutesDeps) {
  const app = new Hono();

  app.get('/', async (c) => {
    const query = z.object({
      since: z.coerce.number().int().optional(),
      until: z.coerce.number().int().optional(),
      by: z.enum(['tool', 'principal', 'server']).default('tool'),
      action: z.string().optional(),
    }).parse({
      since: c.req.query('since'),
      until: c.req.query('until'),
      by: c.req.query('by'),
      action: c.req.query('action'),
    });

    const series = await deps.storage.audit.aggregateUsage(query);
    return c.json({
      range: { since: query.since, until: query.until },
      by: query.by,
      action: query.action ?? 'tool.call',
      series,
    });
  });

  return app;
}
