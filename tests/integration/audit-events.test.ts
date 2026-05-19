import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { makeStorage } from '../fixtures/helpers/make-storage.js';
import { ToolRegistry } from '../../src/registry/tool.registry.js';
import { ToolGroupManager } from '../../src/registry/tool.groups.js';
import { PromptRegistry } from '../../src/registry/prompt.registry.js';
import { SessionManager } from '../../src/session/session.manager.js';
import { PolicyEngine } from '../../src/middleware/authz/policy.engine.js';
import { createAdminRoutes } from '../../src/routes/admin.routes.js';
import { newId } from '../../src/utils/uuid.js';
import { hashSecret } from '../../src/utils/crypto.js';
import { generateToken, computePrefix } from '../../src/identity/token.js';
import { bearerTokenMiddleware } from '../../src/middleware/auth/bearer-token.middleware.js';
import { GatewayConfigSchema, type GatewayConfig } from '../../src/config/schema.js';

async function setup() {
  const storage = await makeStorage();
  const id = newId();
  await storage.principals.createServiceAccount({ id, displayName: 'a' });
  const raw = generateToken('sat', 'live');
  await storage.tokens.create({
    id: newId(), principalId: id, prefix: computePrefix(raw), hash: await hashSecret(raw),
  });

  await storage.audit.write({ id: newId(), action: 'tool.call', result: 'success', principalId: id, resource: 'db__q' });
  await storage.audit.write({ id: newId(), action: 'tool.call', result: 'denied', principalId: id, resource: 'fs__write' });
  await storage.audit.write({ id: newId(), action: 'tool.list', result: 'success', principalId: id });

  const config: GatewayConfig = GatewayConfigSchema.parse({
    mode: 'development',
    gateway: { port: 3001, host: '127.0.0.1' },
    authorization: { enabled: true, modelFile: './config/policy.model.conf', policyFile: './config/policy.csv' },
  });
  const policyEngine = new PolicyEngine({ storage, modelFile: config.authorization.modelFile });
  await policyEngine.load();

  const registry = new ToolRegistry(storage);
  const app = new Hono();
  app.use('*', bearerTokenMiddleware({ storage }));
  app.route('/api', createAdminRoutes({
    config, storage,
    toolRegistry: registry,
    toolGroups: new ToolGroupManager(storage, registry),
    sessionManager: new SessionManager(),
    promptRegistry: new PromptRegistry(storage),
    policyEngine,
  }));
  return { app, storage, token: raw };
}

describe('GET /api/audit/events', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { env = await setup(); });
  afterEach(async () => { await env.storage.close(); });

  it('returns all events when no filter', async () => {
    const r = await env.app.request('/api/audit/events', {
      headers: { Authorization: `Bearer ${env.token}` },
    });
    expect(r.status).toBe(200);
    const body = await r.json() as { events: Array<{ action: string; result: string }> };
    expect(body.events.length).toBe(3);
  });

  it('filters by action', async () => {
    const r = await env.app.request('/api/audit/events?action=tool.call', {
      headers: { Authorization: `Bearer ${env.token}` },
    });
    const body = await r.json() as { events: Array<{ action: string }> };
    expect(body.events.length).toBe(2);
    expect(body.events.every((e) => e.action === 'tool.call')).toBe(true);
  });

  it('filters by result', async () => {
    const r = await env.app.request('/api/audit/events?result=denied', {
      headers: { Authorization: `Bearer ${env.token}` },
    });
    const body = await r.json() as { events: Array<{ result: string }> };
    expect(body.events.length).toBe(1);
    expect(body.events[0].result).toBe('denied');
  });
});
