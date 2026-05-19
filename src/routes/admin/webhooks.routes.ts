// ============================================================
// Admin Webhooks Routes (/api/webhooks)
//
// REST surface for webhook management:
//   GET    /api/webhooks
//   POST   /api/webhooks
//   DELETE /api/webhooks/:id
// ============================================================

import { Hono } from 'hono';
import { z } from 'zod';
import type { StorageAdapter } from '../../storage/adapter.js';
import { newId } from '../../utils/uuid.js';

export interface WebhooksRoutesDeps { storage: StorageAdapter; }

export function createWebhooksRoutes(deps: WebhooksRoutesDeps) {
  const app = new Hono();

  app.get('/', async (c) => c.json({ webhooks: await deps.storage.webhooks.list() }));

  const KNOWN_EVENTS = [
    'approval.requested',
    'approval.approved',
    'approval.rejected',
    'approval.expired',
  ];

  app.get('/events', (c) => {
    return c.json({ events: KNOWN_EVENTS });
  });

  app.post('/', async (c) => {
    const body = z.object({
      name: z.string().min(1),
      url: z.string().url(),
      secret: z.string().optional(),
      events: z.array(z.string()).default([]),
    }).parse(await c.req.json());
    const wh = await deps.storage.webhooks.create({
      id: `wh_${newId().slice(4)}`, name: body.name, url: body.url, secret: body.secret, events: body.events,
    });
    return c.json(wh, 201);
  });

  app.delete('/:id', async (c) => {
    await deps.storage.webhooks.delete(c.req.param('id'));
    return c.json({ ok: true });
  });

  return app;
}
