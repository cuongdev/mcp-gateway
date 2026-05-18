import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { makeStorage } from '../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../src/storage/sqlite.adapter.js';
import { ToolRegistry } from '../../src/registry/tool.registry.js';
import { ToolGroupManager } from '../../src/registry/tool.groups.js';
import { createAdminRoutes } from '../../src/routes/admin.routes.js';
import { SessionManager } from '../../src/session/session.manager.js';
import { newId } from '../../src/utils/uuid.js';
import { hashSecret } from '../../src/utils/crypto.js';
import { generateToken, computePrefix } from '../../src/identity/token.js';
import { bearerTokenMiddleware } from '../../src/middleware/auth/bearer-token.middleware.js';

async function setup() {
  const storage = await makeStorage();
  await storage.servers.upsert({
    name: 'db', transportType: 'streamable-http', transportConfig: { url: 'u' },
  });
  const registry = new ToolRegistry(storage);
  await registry.registerServerTools('db', [
    { name: 'query', description: '', inputSchema: {} },
    { name: 'delete', description: '', inputSchema: {} },
  ]);
  const groups = new ToolGroupManager(storage, registry);
  await groups.load();
  const sessionManager = new SessionManager();

  const principalId = newId();
  await storage.principals.createServiceAccount({ id: principalId, displayName: 'a' });
  const raw = generateToken('sat', 'live');
  await storage.tokens.create({
    id: newId(), principalId, prefix: computePrefix(raw), hash: await hashSecret(raw),
  });

  const app = new Hono();
  app.use('*', bearerTokenMiddleware({ storage }));
  app.route('/api', createAdminRoutes({
    config: {} as never,
    storage,
    toolRegistry: registry,
    toolGroups: groups,
    sessionManager,
  }));
  return { app, storage, registry, groups, token: raw };
}

describe('group admin routes', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { env = await setup(); });
  afterEach(async () => { await env.storage.close(); });

  it('PATCH /api/groups/:name sets included_servers and excluded_tools', async () => {
    await env.groups.create('g', ['db__query'], { description: '', allowedRoles: [] });
    const r = await env.app.request('/api/groups/g', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        includedServers: ['db'],
        excludedTools: ['db__delete'],
      }),
    });
    expect(r.status).toBe(200);

    const get = await env.app.request('/api/groups/g', {
      headers: { Authorization: `Bearer ${env.token}` },
    });
    const body = await get.json() as { group: { tools: string[]; includedServers: string[]; excludedTools: string[] } };
    expect(body.group.includedServers).toEqual(['db']);
    expect(body.group.excludedTools).toEqual(['db__delete']);
  });

  it('POST /api/groups accepts included_servers and excluded_tools in body', async () => {
    const r = await env.app.request('/api/groups', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'g2',
        description: '',
        tools: [],
        includedServers: ['db'],
        excludedTools: ['db__delete'],
        allowedRoles: [],
      }),
    });
    expect(r.status).toBe(201);
    expect(env.groups.resolveTools('g2').sort()).toEqual(['db__query']);
  });
});
