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
  await storage.servers.upsert({
    name: 'db', transportType: 'streamable-http', transportConfig: { url: 'u' },
  });
  const registry = new ToolRegistry(storage);
  await registry.registerServerTools('db', [
    { name: 'q', description: '', inputSchema: {} },
  ]);
  const id = newId();
  await storage.principals.createServiceAccount({ id, displayName: 'a' });
  const raw = generateToken('sat', 'live');
  await storage.tokens.create({
    id: newId(), principalId: id, prefix: computePrefix(raw), hash: await hashSecret(raw),
  });
  const app = new Hono();
  app.use('*', bearerTokenMiddleware({ storage }));
  app.route('/api', createAdminRoutes({
    config: {} as never, storage, toolRegistry: registry,
    toolGroups: new ToolGroupManager(storage, registry),
    sessionManager: new SessionManager(),
    promptRegistry: new PromptRegistry(storage),
  }));
  return { app, storage, registry, token: raw };
}

describe('PATCH /api/tools/:name — cache flags', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { env = await setup(); });
  afterEach(async () => { await env.storage.close(); });

  it('sets cacheable + cacheTtlSec + cachePerPrincipal', async () => {
    const r = await env.app.request('/api/tools/db__q', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cacheable: true, cacheTtlSec: 60, cachePerPrincipal: true }),
    });
    expect(r.status).toBe(200);
    const t = await env.storage.tools.findByCanonicalName('db__q');
    expect(t?.cacheable).toBe(true);
    expect(t?.cacheTtlSec).toBe(60);
    expect(t?.cachePerPrincipal).toBe(true);
  });

  it('returns 404 for unknown tool', async () => {
    const r = await env.app.request('/api/tools/nope__x', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cacheable: true }),
    });
    expect(r.status).toBe(404);
  });

  it('partial update preserves untouched fields', async () => {
    await env.storage.tools.setCacheFlags('db__q', {
      cacheable: true, cacheTtlSec: 60, cachePerPrincipal: false,
    });
    const r = await env.app.request('/api/tools/db__q', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cachePerPrincipal: true }),
    });
    expect(r.status).toBe(200);
    const t = await env.storage.tools.findByCanonicalName('db__q');
    expect(t?.cacheable).toBe(true);
    expect(t?.cacheTtlSec).toBe(60);
    expect(t?.cachePerPrincipal).toBe(true);
  });
});
