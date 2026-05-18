// tests/integration/users.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { makeStorage } from '../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../src/storage/sqlite.adapter.js';
import { ToolRegistry } from '../../src/registry/tool.registry.js';
import { ToolGroupManager } from '../../src/registry/tool.groups.js';
import { PromptRegistry } from '../../src/registry/prompt.registry.js';
import { SessionManager } from '../../src/session/session.manager.js';
import { createAdminRoutes } from '../../src/routes/admin.routes.js';
import { newId } from '../../src/utils/uuid.js';
import { hashSecret } from '../../src/utils/crypto.js';
import { generateToken, computePrefix } from '../../src/identity/token.js';
import { bearerTokenMiddleware } from '../../src/middleware/auth/bearer-token.middleware.js';

async function adminSetup() {
  const storage = await makeStorage();
  const principalId = newId();
  await storage.principals.createServiceAccount({ id: principalId, displayName: 'admin' });
  const raw = generateToken('sat', 'live');
  await storage.tokens.create({
    id: newId(), principalId, prefix: computePrefix(raw), hash: await hashSecret(raw),
  });
  const app = new Hono();
  app.use('*', bearerTokenMiddleware({ storage }));
  const registry = new ToolRegistry(storage);
  app.route('/api', createAdminRoutes({
    config: {} as never, storage,
    toolRegistry: registry,
    toolGroups: new ToolGroupManager(storage, registry),
    sessionManager: new SessionManager(),
    promptRegistry: new PromptRegistry(storage),
  }));
  return { app, storage, token: raw };
}

describe('users admin routes', () => {
  let env: Awaited<ReturnType<typeof adminSetup>>;
  beforeEach(async () => { env = await adminSetup(); });
  afterEach(async () => { await env.storage.close(); });

  it('POST /api/users creates a user', async () => {
    const r = await env.app.request('/api/users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'alice@example.com', displayName: 'Alice' }),
    });
    expect(r.status).toBe(201);
    const body = await r.json() as { principalId: string };
    const p = await env.storage.principals.findById(body.principalId);
    expect(p?.type).toBe('user');
    expect(p?.email).toBe('alice@example.com');
  });

  it('POST /api/users rejects duplicate email', async () => {
    await env.app.request('/api/users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.com', displayName: 'a' }),
    });
    const r2 = await env.app.request('/api/users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.com', displayName: 'a2' }),
    });
    expect(r2.status).toBe(409);
  });

  it('GET /api/users lists users', async () => {
    await env.app.request('/api/users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.com', displayName: 'a' }),
    });
    const r = await env.app.request('/api/users', {
      headers: { Authorization: `Bearer ${env.token}` },
    });
    const body = await r.json() as { users: Array<{ email: string }> };
    expect(body.users.length).toBe(1);
    expect(body.users[0].email).toBe('a@b.com');
  });

  it('DELETE /api/users/:id (soft delete = disabled)', async () => {
    const c = await env.app.request('/api/users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.com', displayName: 'a' }),
    });
    const { principalId } = await c.json() as { principalId: string };
    const r = await env.app.request(`/api/users/${principalId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${env.token}` },
    });
    expect(r.status).toBe(200);
    const p = await env.storage.principals.findById(principalId);
    expect(p?.disabled).toBe(true);
  });
});
