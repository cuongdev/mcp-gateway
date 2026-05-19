// ============================================================
// Proxy Admin Routes — CRUD for outbound proxies + reference
// management and force-cascade deletion.
//
// All responses redact the proxy URL password via redactProxyUrl.
// Internal storage retains the original URL so the dispatcher can
// authenticate to the proxy.
// ============================================================

import { Hono } from 'hono';
import { z } from 'zod';
import type { StorageAdapter } from '../../storage/adapter.js';
import type { ProxyRegistry } from '../../proxy/registry.js';
import type { ProxyRow } from '../../storage/repositories/proxy.repo.js';
import { newId } from '../../utils/uuid.js';
import { redactProxyUrl } from '../../proxy/redact.js';

export interface ProxiesRoutesDeps {
  storage: StorageAdapter;
  proxyRegistry: ProxyRegistry;
}

function publicView(row: ProxyRow) {
  return { ...row, url: redactProxyUrl(row.url) };
}

export function createProxiesRoutes(deps: ProxiesRoutesDeps) {
  const app = new Hono();

  app.get('/', async (c) => {
    const all = await deps.storage.proxies.list();
    return c.json({ proxies: all.map(publicView) });
  });

  app.post('/', async (c) => {
    const body = z.object({
      name: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase alphanumeric/hyphen'),
      url: z.string().url(),
      description: z.string().optional(),
    }).parse(await c.req.json());

    const existing = await deps.storage.proxies.findByName(body.name);
    if (existing) return c.json({ error: { code: 'conflict', message: 'name exists' } }, 409);

    const id = `prx_${newId().slice(4)}`;
    try {
      const row = await deps.storage.proxies.create({
        id, name: body.name, url: body.url, description: body.description,
      });
      await deps.proxyRegistry.upsert(row);
      return c.json(publicView(row), 201);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('UNIQUE') || msg.includes('duplicate')) {
        return c.json({ error: { code: 'conflict' } }, 409);
      }
      throw err;
    }
  });

  app.get('/:id', async (c) => {
    const row = await deps.storage.proxies.findById(c.req.param('id'));
    if (!row) return c.json({ error: { code: 'not_found' } }, 404);
    return c.json(publicView(row));
  });

  app.patch('/:id', async (c) => {
    const id = c.req.param('id');
    const existing = await deps.storage.proxies.findById(id);
    if (!existing) return c.json({ error: { code: 'not_found' } }, 404);

    const body = z.object({
      url: z.string().url().optional(),
      description: z.string().optional(),
      enabled: z.boolean().optional(),
    }).parse(await c.req.json());

    if (body.url !== undefined || body.description !== undefined) {
      await deps.storage.proxies.update(id, { url: body.url, description: body.description });
    }
    if (body.enabled !== undefined) {
      await deps.storage.proxies.setEnabled(id, body.enabled);
    }

    const refreshed = await deps.storage.proxies.findById(id);
    if (refreshed) await deps.proxyRegistry.upsert(refreshed);
    return c.json({ ok: true });
  });

  app.delete('/:id', async (c) => {
    const id = c.req.param('id');
    const row = await deps.storage.proxies.findById(id);
    if (!row) return c.json({ error: { code: 'not_found' } }, 404);

    const force = c.req.query('force') === 'true';
    const refs = await deps.storage.proxies.references(row.name);

    if (refs.length > 0 && !force) {
      return c.json({ error: { code: 'in_use', references: refs } }, 409);
    }

    let detached: { kind: 'server' | 'group'; name: string }[] = [];
    if (force && refs.length > 0) {
      detached = await deps.storage.proxies.detachAll(row.name);
    }
    await deps.storage.proxies.delete(id);
    await deps.proxyRegistry.remove(row.name);
    return c.json({ ok: true, detached });
  });

  app.get('/:id/references', async (c) => {
    const row = await deps.storage.proxies.findById(c.req.param('id'));
    if (!row) return c.json({ error: { code: 'not_found' } }, 404);
    return c.json({ references: await deps.storage.proxies.references(row.name) });
  });

  return app;
}
