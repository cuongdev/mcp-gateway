import { Hono } from 'hono';
import { z } from 'zod';
import type { StorageAdapter } from '../../storage/adapter.js';
import { newId } from '../../utils/uuid.js';
import { seedBuiltinRedactionRules } from '../../redaction/seed.js';

export interface TenantsRoutesDeps {
  storage: StorageAdapter;
}

export function createTenantsRoutes(deps: TenantsRoutesDeps) {
  const app = new Hono();

  app.get('/', async (c) => {
    return c.json({ tenants: await deps.storage.tenants.list() });
  });

  app.post('/', async (c) => {
    const body = z.object({
      slug: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/, 'slug must be lowercase alphanumeric/hyphen'),
      displayName: z.string().min(1),
      plan: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }).parse(await c.req.json());

    const existing = await deps.storage.tenants.findBySlug(body.slug);
    if (existing) {
      return c.json({ error: { code: 'conflict', message: 'slug already exists' } }, 409);
    }

    const id = `tnt_${newId().slice(4)}`;
    try {
      const tenant = await deps.storage.tenants.create({
        id, slug: body.slug, displayName: body.displayName,
        plan: body.plan, metadata: body.metadata,
      });
      // Seed built-in redaction rules for the new tenant (idempotent).
      await seedBuiltinRedactionRules(deps.storage, tenant.id);
      return c.json(tenant, 201);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('UNIQUE') || msg.includes('duplicate')) {
        return c.json({ error: { code: 'conflict' } }, 409);
      }
      throw err;
    }
  });

  app.get('/:id', async (c) => {
    const t = await deps.storage.tenants.findById(c.req.param('id'));
    if (!t) return c.json({ error: { code: 'not_found' } }, 404);
    return c.json(t);
  });

  app.patch('/:id', async (c) => {
    const id = c.req.param('id');
    if (!(await deps.storage.tenants.findById(id))) {
      return c.json({ error: { code: 'not_found' } }, 404);
    }
    const body = z.object({
      displayName: z.string().min(1).optional(),
      plan: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }).parse(await c.req.json());
    await deps.storage.tenants.update(id, body);
    return c.json({ ok: true });
  });

  app.post('/:id/suspend', async (c) => {
    const id = c.req.param('id');
    if (!(await deps.storage.tenants.findById(id))) return c.json({ error: { code: 'not_found' } }, 404);
    await deps.storage.tenants.setStatus(id, 'suspended');
    return c.json({ ok: true });
  });

  app.post('/:id/resume', async (c) => {
    const id = c.req.param('id');
    if (!(await deps.storage.tenants.findById(id))) return c.json({ error: { code: 'not_found' } }, 404);
    await deps.storage.tenants.setStatus(id, 'active');
    return c.json({ ok: true });
  });

  return app;
}
