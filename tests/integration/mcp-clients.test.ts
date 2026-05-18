import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { makeStorage } from '../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../src/storage/sqlite.adapter.js';
import { ToolRegistry } from '../../src/registry/tool.registry.js';
import { ToolGroupManager } from '../../src/registry/tool.groups.js';
import { SessionManager } from '../../src/session/session.manager.js';
import { createAdminRoutes } from '../../src/routes/admin.routes.js';
import { newId } from '../../src/utils/uuid.js';
import { hashSecret } from '../../src/utils/crypto.js';
import { generateToken, computePrefix } from '../../src/identity/token.js';
import { bearerTokenMiddleware } from '../../src/middleware/auth/bearer-token.middleware.js';

async function setup() {
  const storage = await makeStorage();
  const registry = new ToolRegistry(storage);
  const groups = new ToolGroupManager(storage, registry);
  const sessionManager = new SessionManager();

  const principalId = newId();
  await storage.principals.createServiceAccount({ id: principalId, displayName: 'admin' });
  const raw = generateToken('sat', 'live');
  await storage.tokens.create({
    id: newId(), principalId, prefix: computePrefix(raw), hash: await hashSecret(raw),
  });

  const app = new Hono();
  app.use('*', bearerTokenMiddleware({ storage }));
  app.route('/api', createAdminRoutes({
    config: {} as never, storage, toolRegistry: registry, toolGroups: groups, sessionManager,
  }));
  return { app, storage, token: raw };
}

describe('mcp-clients admin routes', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { env = await setup(); });
  afterEach(async () => { await env.storage.close(); });

  it('POST /api/mcp-clients creates and returns token once', async () => {
    const r = await env.app.request('/api/mcp-clients', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'claude-prod',
        description: 'Claude Desktop production',
        allowedServers: ['db', 'fs'],
      }),
    });
    expect(r.status).toBe(201);
    const body = await r.json() as { principalId: string; token: string };
    expect(body.token).toMatch(/^mcp_mct_live_[A-Z2-7]{32}$/);
    expect(body.principalId.length).toBeGreaterThan(10);
  });

  it('GET /api/mcp-clients lists clients (no tokens shown)', async () => {
    await env.app.request('/api/mcp-clients', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'c1', allowedServers: ['*'] }),
    });
    const r = await env.app.request('/api/mcp-clients', {
      headers: { Authorization: `Bearer ${env.token}` },
    });
    expect(r.status).toBe(200);
    const body = await r.json() as { clients: Array<{ name: string; token?: string }> };
    expect(body.clients.length).toBe(1);
    expect(body.clients[0].name).toBe('c1');
    expect(body.clients[0].token).toBeUndefined();
  });

  it('PATCH /api/mcp-clients/:id updates allowedServers', async () => {
    const create = await env.app.request('/api/mcp-clients', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'c', allowedServers: ['db'] }),
    });
    const { principalId } = await create.json() as { principalId: string };

    const r = await env.app.request(`/api/mcp-clients/${principalId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ allowedServers: ['db', 'fs'] }),
    });
    expect(r.status).toBe(200);

    const p = await env.storage.principals.findById(principalId);
    expect(p?.allowedServers).toEqual(['db', 'fs']);
  });

  it('DELETE /api/mcp-clients/:id cascades tokens', async () => {
    const create = await env.app.request('/api/mcp-clients', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'c', allowedServers: ['db'] }),
    });
    const { principalId, token: mcToken } = await create.json() as { principalId: string; token: string };

    const r = await env.app.request(`/api/mcp-clients/${principalId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${env.token}` },
    });
    expect(r.status).toBe(200);

    expect(await env.storage.principals.findById(principalId)).toBeNull();
    expect(await env.storage.tokens.findByPrefix(mcToken.slice(0, 21))).toBeNull();
  });

  it('POST /api/mcp-clients/:id/tokens/rotate issues new + revokes old', async () => {
    const create = await env.app.request('/api/mcp-clients', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'c', allowedServers: ['*'] }),
    });
    const { principalId, token: oldToken } = await create.json() as { principalId: string; token: string };

    const r = await env.app.request(`/api/mcp-clients/${principalId}/tokens/rotate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}` },
    });
    expect(r.status).toBe(200);
    const { token: newToken } = await r.json() as { token: string };
    expect(newToken).not.toBe(oldToken);

    const oldRow = await env.storage.tokens.findByPrefix(oldToken.slice(0, 21));
    expect(oldRow?.revokedAt).toBeGreaterThan(0);
    const newRow = await env.storage.tokens.findByPrefix(newToken.slice(0, 21));
    expect(newRow?.revokedAt).toBeFalsy();
  });
});
