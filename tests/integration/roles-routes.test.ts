import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { makeStorage } from '../fixtures/helpers/make-storage.js';
import { ToolRegistry } from '../../src/registry/tool.registry.js';
import { ToolGroupManager } from '../../src/registry/tool.groups.js';
import { PromptRegistry } from '../../src/registry/prompt.registry.js';
import { SessionManager } from '../../src/session/session.manager.js';
import { initializeEnforcer } from '../../src/middleware/authz/policy.engine.js';
import { createAdminRoutes } from '../../src/routes/admin.routes.js';
import { newId } from '../../src/utils/uuid.js';
import { hashSecret } from '../../src/utils/crypto.js';
import { generateToken, computePrefix } from '../../src/identity/token.js';
import { bearerTokenMiddleware } from '../../src/middleware/auth/bearer-token.middleware.js';
import type { GatewayConfig } from '../../src/config/schema.js';

async function setup() {
  const storage = await makeStorage();
  const id = newId();
  await storage.principals.createServiceAccount({ id, displayName: 'a' });
  const raw = generateToken('sat', 'live');
  await storage.tokens.create({
    id: newId(), principalId: id, prefix: computePrefix(raw), hash: await hashSecret(raw),
  });

  // Initialize the module-level Casbin enforcer used by the legacy function API
  await initializeEnforcer({
    modelFile: './config/policy.model.conf',
    policyFile: './config/policy.csv',
  });

  const registry = new ToolRegistry(storage);
  const app = new Hono();
  app.use('*', bearerTokenMiddleware({ storage }));
  app.route('/api', createAdminRoutes({
    config: {} as GatewayConfig, storage,
    toolRegistry: registry,
    toolGroups: new ToolGroupManager(storage, registry),
    sessionManager: new SessionManager(),
    promptRegistry: new PromptRegistry(storage),
  }));
  return { app, storage, token: raw };
}

describe('GET /api/roles + DELETE /api/roles', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { env = await setup(); });
  afterEach(async () => { await env.storage.close(); });

  it('GET lists role bindings (g-rules)', async () => {
    // Add via existing POST
    await env.app.request('/api/roles', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: 'alice@example.com', role: 'admin' }),
    });

    const r = await env.app.request('/api/roles', {
      headers: { Authorization: `Bearer ${env.token}` },
    });
    expect(r.status).toBe(200);
    const body = await r.json() as { bindings: Array<{ user: string; role: string }> };
    expect(body.bindings).toContainEqual({ user: 'alice@example.com', role: 'admin' });
  });

  it('DELETE removes a role binding', async () => {
    await env.app.request('/api/roles', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: 'bob@example.com', role: 'analyst' }),
    });

    const r = await env.app.request('/api/roles', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: 'bob@example.com', role: 'analyst' }),
    });
    expect(r.status).toBe(200);

    const r2 = await env.app.request('/api/roles', {
      headers: { Authorization: `Bearer ${env.token}` },
    });
    const body = await r2.json() as { bindings: Array<{ user: string; role: string }> };
    expect(body.bindings).not.toContainEqual({ user: 'bob@example.com', role: 'analyst' });
  });
});
