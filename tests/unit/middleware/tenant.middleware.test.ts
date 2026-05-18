import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { makeStorage } from '../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../src/storage/sqlite.adapter.js';
import { tenantMiddleware } from '../../../src/middleware/tenant/tenant.middleware.js';

describe('tenantMiddleware', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => { storage = await makeStorage(); });
  afterEach(async () => { await storage.close(); });

  it('resolves tenant from X-Tenant header', async () => {
    await storage.tenants.create({ id: 'tnt_acme', slug: 'acme', displayName: 'Acme' });
    const app = new Hono();
    app.use('*', tenantMiddleware({
      storage,
      enabled: true,
      headerName: 'X-Tenant',
      defaultSlug: 'default',
      suspendedHttpStatus: 402,
    }));
    app.get('/x', (c) => c.json({ tenantId: c.get('tenantId') }));
    const r = await app.request('/x', { headers: { 'X-Tenant': 'acme' } });
    expect(r.status).toBe(200);
    const body = await r.json() as { tenantId: string };
    expect(body.tenantId).toBe('tnt_acme');
  });

  it('falls back to default slug when header absent', async () => {
    const app = new Hono();
    app.use('*', tenantMiddleware({
      storage, enabled: true, headerName: 'X-Tenant',
      defaultSlug: 'default', suspendedHttpStatus: 402,
    }));
    app.get('/x', (c) => c.json({ tenantId: c.get('tenantId') }));
    const r = await app.request('/x');
    expect(r.status).toBe(200);
    const body = await r.json() as { tenantId: string };
    expect(body.tenantId).toBe('tnt_default');
  });

  it('returns 404 for unknown tenant slug', async () => {
    const app = new Hono();
    app.use('*', tenantMiddleware({
      storage, enabled: true, headerName: 'X-Tenant',
      defaultSlug: 'default', suspendedHttpStatus: 402,
    }));
    app.get('/x', (c) => c.json({}));
    const r = await app.request('/x', { headers: { 'X-Tenant': 'doesnotexist' } });
    expect(r.status).toBe(404);
  });

  it('returns 402 for suspended tenant', async () => {
    await storage.tenants.create({ id: 'tnt_sus', slug: 'sus', displayName: 'Sus' });
    await storage.tenants.setStatus('tnt_sus', 'suspended');
    const app = new Hono();
    app.use('*', tenantMiddleware({
      storage, enabled: true, headerName: 'X-Tenant',
      defaultSlug: 'default', suspendedHttpStatus: 402,
    }));
    app.get('/x', (c) => c.json({}));
    const r = await app.request('/x', { headers: { 'X-Tenant': 'sus' } });
    expect(r.status).toBe(402);
  });

  it('when disabled, sets tenantId to tnt_default and bypasses lookup', async () => {
    const app = new Hono();
    app.use('*', tenantMiddleware({
      storage, enabled: false, headerName: 'X-Tenant',
      defaultSlug: 'default', suspendedHttpStatus: 402,
    }));
    app.get('/x', (c) => c.json({ tenantId: c.get('tenantId') }));
    const r = await app.request('/x', { headers: { 'X-Tenant': 'whatever' } });
    expect(r.status).toBe(200);
    const body = await r.json() as { tenantId: string };
    expect(body.tenantId).toBe('tnt_default');
  });
});
