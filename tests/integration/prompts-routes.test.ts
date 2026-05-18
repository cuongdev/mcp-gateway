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

async function setup() {
  const storage = await makeStorage();
  await storage.servers.upsert({ name: 'db', transportType: 'streamable-http', transportConfig: { url: 'u' } });
  const promptReg = new PromptRegistry(storage);
  await promptReg.registerServerPrompts('db', [
    { name: 'report', description: 'monthly report', argumentsSchema: { type: 'object', properties: { month: { type: 'string' } } } },
    { name: 'summary', description: 'summary', argumentsSchema: { type: 'object' } },
  ]);
  const id = newId();
  await storage.principals.createServiceAccount({ id, displayName: 'a' });
  const raw = generateToken('sat', 'live');
  await storage.tokens.create({
    id: newId(), principalId: id, prefix: computePrefix(raw), hash: await hashSecret(raw),
  });
  const app = new Hono();
  app.use('*', bearerTokenMiddleware({ storage }));
  const registry = new ToolRegistry(storage);
  app.route('/api', createAdminRoutes({
    config: {} as never, storage,
    toolRegistry: registry,
    toolGroups: new ToolGroupManager(storage, registry),
    sessionManager: new SessionManager(),
    promptRegistry: promptReg,
  }));
  return { app, storage, promptReg, token: raw };
}

describe('prompts routes', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { env = await setup(); });
  afterEach(async () => { await env.storage.close(); });

  it('GET /api/prompts lists all prompts', async () => {
    const r = await env.app.request('/api/prompts', {
      headers: { Authorization: `Bearer ${env.token}` },
    });
    expect(r.status).toBe(200);
    const body = await r.json() as { prompts: Array<{ canonicalName: string; enabled: boolean }> };
    expect(body.prompts.length).toBe(2);
    expect(body.prompts.map((p) => p.canonicalName).sort()).toEqual(['db__report', 'db__summary']);
  });

  it('PUT /api/prompts/:name/disable then GET excludes from default list', async () => {
    const r1 = await env.app.request('/api/prompts/db__report/disable', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${env.token}` },
    });
    expect(r1.status).toBe(200);

    const r2 = await env.app.request('/api/prompts?enabled=true', {
      headers: { Authorization: `Bearer ${env.token}` },
    });
    const body = await r2.json() as { prompts: Array<{ canonicalName: string }> };
    expect(body.prompts.map((p) => p.canonicalName)).toEqual(['db__summary']);
  });

  it('PUT /api/prompts/:name/enable re-enables', async () => {
    await env.app.request('/api/prompts/db__report/disable', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${env.token}` },
    });
    const r = await env.app.request('/api/prompts/db__report/enable', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${env.token}` },
    });
    expect(r.status).toBe(200);
    const found = await env.storage.prompts.findByCanonicalName('db__report');
    expect(found?.enabled).toBe(true);
  });
});
