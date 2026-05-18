import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { makeStorage } from '../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../src/storage/sqlite.adapter.js';
import { newId } from '../../src/utils/uuid.js';
import { hashSecret } from '../../src/utils/crypto.js';
import { generateToken, computePrefix } from '../../src/identity/token.js';
import { bearerTokenMiddleware } from '../../src/middleware/auth/bearer-token.middleware.js';
import { createTenantsRoutes } from '../../src/routes/admin/tenants.routes.js';

async function setup() {
  const storage = await makeStorage();
  const id = newId();
  await storage.principals.createServiceAccount({ id, displayName: 'sysadmin' });
  const raw = generateToken('sat', 'live');
  await storage.tokens.create({
    id: newId(), principalId: id, prefix: computePrefix(raw), hash: await hashSecret(raw),
  });
  const app = new Hono();
  app.use('*', bearerTokenMiddleware({ storage }));
  app.route('/api/system/tenants', createTenantsRoutes({ storage }));
  return { app, storage, token: raw };
}

describe('system tenant routes', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { env = await setup(); });
  afterEach(async () => { await env.storage.close(); });

  it('GET /api/system/tenants lists tnt_default', async () => {
    const r = await env.app.request('/api/system/tenants', {
      headers: { Authorization: `Bearer ${env.token}` },
    });
    expect(r.status).toBe(200);
    const body = await r.json() as { tenants: Array<{ slug: string }> };
    expect(body.tenants.some((t) => t.slug === 'default')).toBe(true);
  });

  it('POST /api/system/tenants creates a tenant', async () => {
    const r = await env.app.request('/api/system/tenants', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'acme', displayName: 'Acme Corp', plan: 'pro' }),
    });
    expect(r.status).toBe(201);
    const body = await r.json() as { id: string; slug: string };
    expect(body.id).toMatch(/^tnt_/);
    expect(body.slug).toBe('acme');
  });

  it('POST rejects duplicate slug', async () => {
    await env.app.request('/api/system/tenants', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'dup', displayName: 'D' }),
    });
    const r = await env.app.request('/api/system/tenants', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'dup', displayName: 'D2' }),
    });
    expect(r.status).toBe(409);
  });

  it('PATCH /api/system/tenants/:id updates plan', async () => {
    const c = await env.app.request('/api/system/tenants', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'acme', displayName: 'Acme' }),
    });
    const { id } = await c.json() as { id: string };
    const r = await env.app.request(`/api/system/tenants/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'enterprise' }),
    });
    expect(r.status).toBe(200);
    const t = await env.storage.tenants.findById(id);
    expect(t?.plan).toBe('enterprise');
  });

  it('POST /api/system/tenants/:id/suspend → status=suspended', async () => {
    const c = await env.app.request('/api/system/tenants', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'acme', displayName: 'Acme' }),
    });
    const { id } = await c.json() as { id: string };
    const r = await env.app.request(`/api/system/tenants/${id}/suspend`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}` },
    });
    expect(r.status).toBe(200);
    const t = await env.storage.tenants.findById(id);
    expect(t?.status).toBe('suspended');
  });

  it('POST /api/system/tenants/:id/resume → status=active', async () => {
    const c = await env.app.request('/api/system/tenants', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'acme', displayName: 'Acme' }),
    });
    const { id } = await c.json() as { id: string };
    await env.storage.tenants.setStatus(id, 'suspended');
    const r = await env.app.request(`/api/system/tenants/${id}/resume`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}` },
    });
    expect(r.status).toBe(200);
    expect((await env.storage.tenants.findById(id))?.status).toBe('active');
  });
});
