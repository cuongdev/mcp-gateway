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

async function userSetup() {
  const storage = await makeStorage();
  const userId = newId();
  await storage.principals.createUser({ id: userId, email: 'u@e.com', displayName: 'U' });
  const userRaw = generateToken('pat', 'live');
  await storage.tokens.create({
    id: newId(), principalId: userId, prefix: computePrefix(userRaw), hash: await hashSecret(userRaw),
    name: 'session',
  });
  const app = new Hono();
  app.use('*', bearerTokenMiddleware({ storage }));
  const registry = new ToolRegistry(storage);
  app.route('/api', createAdminRoutes({
    config: {} as never, storage,
    toolRegistry: registry,
    toolGroups: new ToolGroupManager(storage, registry),
    sessionManager: new SessionManager(),
  }));
  return { app, storage, userId, userToken: userRaw };
}

describe('PAT flow', () => {
  let env: Awaited<ReturnType<typeof userSetup>>;
  beforeEach(async () => { env = await userSetup(); });
  afterEach(async () => { await env.storage.close(); });

  it('POST /api/users/me/tokens creates a PAT', async () => {
    const r = await env.app.request('/api/users/me/tokens', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.userToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'CLI token' }),
    });
    expect(r.status).toBe(201);
    const body = await r.json() as { token: string; tokenId: string };
    expect(body.token).toMatch(/^mcp_pat_live_/);

    const r2 = await env.app.request('/api/users/me/tokens', {
      headers: { Authorization: `Bearer ${body.token}` },
    });
    expect(r2.status).toBe(200);
  });

  it('GET /api/users/me/tokens lists own tokens (no full token shown)', async () => {
    await env.app.request('/api/users/me/tokens', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.userToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'a' }),
    });
    const r = await env.app.request('/api/users/me/tokens', {
      headers: { Authorization: `Bearer ${env.userToken}` },
    });
    const body = await r.json() as { tokens: Array<{ id: string; prefix: string; name: string }> };
    expect(body.tokens.length).toBeGreaterThanOrEqual(1);
    expect(body.tokens[0].prefix).toMatch(/^mcp_pat_live_|^mcp_sat_live_/);
    expect((body.tokens[0] as Record<string, unknown>).hash).toBeUndefined();
  });

  it('DELETE /api/users/me/tokens/:id revokes a PAT', async () => {
    const create = await env.app.request('/api/users/me/tokens', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.userToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'a' }),
    });
    const { tokenId, token } = await create.json() as { tokenId: string; token: string };

    const r = await env.app.request(`/api/users/me/tokens/${tokenId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${env.userToken}` },
    });
    expect(r.status).toBe(200);

    const r2 = await env.app.request('/api/users/me/tokens', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(r2.status).toBe(401);
  });

  it('non-user principals cannot create PATs', async () => {
    const saId = newId();
    await env.storage.principals.createServiceAccount({ id: saId, displayName: 'sa' });
    const saRaw = generateToken('sat', 'live');
    await env.storage.tokens.create({
      id: newId(), principalId: saId, prefix: computePrefix(saRaw), hash: await hashSecret(saRaw),
    });

    const r = await env.app.request('/api/users/me/tokens', {
      method: 'POST',
      headers: { Authorization: `Bearer ${saRaw}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'a' }),
    });
    expect(r.status).toBe(403);
  });
});
