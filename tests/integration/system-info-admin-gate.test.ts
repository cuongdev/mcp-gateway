import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { makeStorage } from '../fixtures/helpers/make-storage.js';
import { ToolRegistry } from '../../src/registry/tool.registry.js';
import { ToolGroupManager } from '../../src/registry/tool.groups.js';
import { PromptRegistry } from '../../src/registry/prompt.registry.js';
import { SessionManager } from '../../src/session/session.manager.js';
import { createAdminRoutes } from '../../src/routes/admin.routes.js';
import { PolicyEngine } from '../../src/middleware/authz/policy.engine.js';
import { GatewayConfigSchema, type GatewayConfig } from '../../src/config/schema.js';
import { newId } from '../../src/utils/uuid.js';
import { hashSecret } from '../../src/utils/crypto.js';
import { generateToken, computePrefix } from '../../src/identity/token.js';
import { bearerTokenMiddleware } from '../../src/middleware/auth/bearer-token.middleware.js';

async function setup(opts: { isAdmin: boolean }) {
  const storage = await makeStorage();
  const principalId = newId();
  const email = opts.isAdmin ? 'admin@example.com' : 'user@example.com';
  await storage.principals.createUser({ id: principalId, email, displayName: opts.isAdmin ? 'Admin' : 'User' });
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

  if (opts.isAdmin) {
    await policyEngine.addRoleForUser(email, 'admin');
  }

  const registry = new ToolRegistry(storage);
  const app = new Hono();
  app.use('*', bearerTokenMiddleware({ storage }));
  app.route('/api', createAdminRoutes({
    config, storage, toolRegistry: registry,
    toolGroups: new ToolGroupManager(storage, registry),
    sessionManager: new SessionManager(),
    promptRegistry: new PromptRegistry(storage),
    policyEngine,
  }));
  return { app, storage, token: raw };
}

describe('GET /api/system/info — admin-only', () => {
  it('admin gets 200 with redacted config', async () => {
    const env = await setup({ isAdmin: true });
    try {
      const r = await env.app.request('/api/system/info', {
        headers: { Authorization: `Bearer ${env.token}` },
      });
      expect(r.status).toBe(200);
    } finally { await env.storage.close(); }
  });

  it('non-admin gets 403', async () => {
    const env = await setup({ isAdmin: false });
    try {
      const r = await env.app.request('/api/system/info', {
        headers: { Authorization: `Bearer ${env.token}` },
      });
      expect(r.status).toBe(403);
    } finally { await env.storage.close(); }
  });
});
