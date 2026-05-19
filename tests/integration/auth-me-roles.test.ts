import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { makeStorage } from '../fixtures/helpers/make-storage.js';
import { ToolRegistry } from '../../src/registry/tool.registry.js';
import { ToolGroupManager } from '../../src/registry/tool.groups.js';
import { PromptRegistry } from '../../src/registry/prompt.registry.js';
import { SessionManager } from '../../src/session/session.manager.js';
import { createAdminRoutes } from '../../src/routes/admin.routes.js';
import { createAuthRoutes } from '../../src/routes/auth.routes.js';
import { PolicyEngine } from '../../src/middleware/authz/policy.engine.js';
import { GatewayConfigSchema, type GatewayConfig } from '../../src/config/schema.js';
import { newId } from '../../src/utils/uuid.js';
import { hashSecret } from '../../src/utils/crypto.js';
import { generateToken, computePrefix } from '../../src/identity/token.js';
import { bearerTokenMiddleware } from '../../src/middleware/auth/bearer-token.middleware.js';

async function setup() {
  const storage = await makeStorage();
  const principalId = newId();
  await storage.principals.createUser({
    id: principalId, email: 'alice@example.com', displayName: 'Alice',
  });
  const raw = generateToken('pat', 'live');
  await storage.tokens.create({
    id: newId(), principalId, prefix: computePrefix(raw), hash: await hashSecret(raw),
  });

  const config: GatewayConfig = GatewayConfigSchema.parse({
    mode: 'development',
    gateway: { port: 3001, host: '127.0.0.1' },
    authorization: { enabled: true, modelFile: './config/policy.model.conf', policyFile: './config/policy.csv' },
  });
  const policyEngine = new PolicyEngine({
    storage,
    modelFile: config.authorization.modelFile,
  });
  await policyEngine.load();

  const registry = new ToolRegistry(storage);
  const app = new Hono();
  app.use('*', bearerTokenMiddleware({ storage }));
  app.route('/auth', createAuthRoutes(config, { storage, policyEngine }));
  app.route('/api', createAdminRoutes({
    config, storage, toolRegistry: registry,
    toolGroups: new ToolGroupManager(storage, registry),
    sessionManager: new SessionManager(),
    promptRegistry: new PromptRegistry(storage),
    policyEngine,
  }));
  return { app, storage, token: raw, email: 'alice@example.com' };
}

describe('GET /auth/me — roles array', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { env = await setup(); });
  afterEach(async () => { await env.storage.close(); });

  it('returns roles: [] when the user has no bindings', async () => {
    const r = await env.app.request('/auth/me', {
      headers: { Authorization: `Bearer ${env.token}` },
    });
    expect(r.status).toBe(200);
    const body = await r.json() as { roles: string[] };
    expect(body.roles).toEqual([]);
  });

  it('returns the user\'s roles after POST /api/roles', async () => {
    await env.app.request('/api/roles', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: env.email, role: 'admin' }),
    });
    const r = await env.app.request('/auth/me', {
      headers: { Authorization: `Bearer ${env.token}` },
    });
    expect(r.status).toBe(200);
    const body = await r.json() as { roles: string[] };
    expect(body.roles).toEqual(['admin']);
  });
});
