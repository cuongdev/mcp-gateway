import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { makeStorage } from '../fixtures/helpers/make-storage.js';
import { ProxyRegistry } from '../../src/proxy/registry.js';
import { createProxiesRoutes } from '../../src/routes/admin/proxies.routes.js';
import { newId } from '../../src/utils/uuid.js';
import { hashSecret } from '../../src/utils/crypto.js';
import { generateToken, computePrefix } from '../../src/identity/token.js';
import { bearerTokenMiddleware } from '../../src/middleware/auth/bearer-token.middleware.js';

async function setup() {
  const storage = await makeStorage();
  const proxyRegistry = new ProxyRegistry(storage);
  await proxyRegistry.load();

  const id = newId();
  await storage.principals.createServiceAccount({ id, displayName: 'admin' });
  const raw = generateToken('sat', 'live');
  await storage.tokens.create({
    id: newId(), principalId: id, prefix: computePrefix(raw), hash: await hashSecret(raw),
  });

  const app = new Hono();
  app.use('*', bearerTokenMiddleware({ storage }));
  app.route('/api/proxies', createProxiesRoutes({ storage, proxyRegistry }));
  return { app, storage, proxyRegistry, token: raw };
}

describe('proxy admin routes', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { env = await setup(); });
  afterEach(async () => {
    await env.proxyRegistry.shutdown();
    await env.storage.close();
  });

  it('POST + GET round-trip redacts password', async () => {
    const r = await env.app.request('/api/proxies', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'corp', url: 'http://admin:secret@corp:8080' }),
    });
    expect(r.status).toBe(201);
    const body = await r.json() as { id: string; url: string };
    expect(body.url).toBe('http://admin:***@corp:8080');

    const get = await env.app.request(`/api/proxies/${body.id}`, {
      headers: { Authorization: `Bearer ${env.token}` },
    });
    const detail = await get.json() as { url: string };
    expect(detail.url).toBe('http://admin:***@corp:8080');

    // Internal storage still has the real URL
    const stored = await env.storage.proxies.findById(body.id);
    expect(stored?.url).toBe('http://admin:secret@corp:8080');
  });

  it('POST rejects duplicate name with 409', async () => {
    await env.app.request('/api/proxies', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'corp', url: 'http://corp:8080' }),
    });
    const r = await env.app.request('/api/proxies', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'corp', url: 'http://other:8080' }),
    });
    expect(r.status).toBe(409);
  });

  it('PATCH updates URL and registry rebuilds dispatcher', async () => {
    const c = await env.app.request('/api/proxies', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'corp', url: 'http://corp:8080' }),
    });
    const { id } = await c.json() as { id: string };
    const r = await env.app.request(`/api/proxies/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://corp:9090' }),
    });
    expect(r.status).toBe(200);
    expect(env.proxyRegistry.getUrl('corp')).toBe('http://corp:9090');
  });

  it('DELETE without force returns 409 with references when in use', async () => {
    const c = await env.app.request('/api/proxies', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'corp', url: 'http://corp:8080' }),
    });
    const { id } = await c.json() as { id: string };

    await env.storage.servers.upsert({ name: 'acme', transportType: 'streamable-http', transportConfig: { url: 'u' } });
    await env.storage.servers.setProxyName('acme', 'corp');

    const del = await env.app.request(`/api/proxies/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${env.token}` },
    });
    expect(del.status).toBe(409);
    const body = await del.json() as { error: { code: string; references: Array<{ kind: string; name: string }> } };
    expect(body.error.code).toBe('in_use');
    expect(body.error.references.find((r) => r.kind === 'server' && r.name === 'acme')).toBeDefined();
  });

  it('DELETE ?force=true cascades nullify and returns detached', async () => {
    const c = await env.app.request('/api/proxies', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'corp', url: 'http://corp:8080' }),
    });
    const { id } = await c.json() as { id: string };

    await env.storage.servers.upsert({ name: 'acme', transportType: 'streamable-http', transportConfig: { url: 'u' } });
    await env.storage.servers.setProxyName('acme', 'corp');

    const del = await env.app.request(`/api/proxies/${id}?force=true`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${env.token}` },
    });
    expect(del.status).toBe(200);
    const body = await del.json() as { ok: boolean; detached: Array<{ kind: string; name: string }> };
    expect(body.ok).toBe(true);
    expect(body.detached.find((r) => r.kind === 'server' && r.name === 'acme')).toBeDefined();
    expect((await env.storage.servers.findByName('acme'))?.proxyName).toBeUndefined();
  });

  it('GET /:id/references lists referencing entities', async () => {
    const c = await env.app.request('/api/proxies', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'corp', url: 'http://corp:8080' }),
    });
    const { id } = await c.json() as { id: string };

    await env.storage.servers.upsert({ name: 'acme', transportType: 'streamable-http', transportConfig: { url: 'u' } });
    await env.storage.servers.setProxyName('acme', 'corp');

    const r = await env.app.request(`/api/proxies/${id}/references`, {
      headers: { Authorization: `Bearer ${env.token}` },
    });
    expect(r.status).toBe(200);
    const body = await r.json() as { references: Array<{ kind: string; name: string }> };
    expect(body.references.length).toBe(1);
  });
});
