import { Hono } from 'hono';
import { z } from 'zod';
import type { StorageAdapter } from '../../storage/adapter.js';

export interface AuditRoutesDeps {
  storage: StorageAdapter;
}

export function createAuditRoutes(deps: AuditRoutesDeps) {
  const app = new Hono();

  app.get('/events', async (c) => {
    const query = z.object({
      since: z.coerce.number().int().optional(),
      until: z.coerce.number().int().optional(),
      principalId: z.string().optional(),
      action: z.string().optional(),
      result: z.enum(['success', 'denied', 'error']).optional(),
      limit: z.coerce.number().int().positive().max(500).optional(),
    }).parse({
      since: c.req.query('since'),
      until: c.req.query('until'),
      principalId: c.req.query('principalId'),
      action: c.req.query('action'),
      result: c.req.query('result'),
      limit: c.req.query('limit'),
    });
    const events = await deps.storage.audit.list(query);
    return c.json({ events, limit: query.limit ?? 100 });
  });

  return app;
}
