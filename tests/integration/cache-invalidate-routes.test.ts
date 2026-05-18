import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { makeStorage } from '../fixtures/helpers/make-storage.js';
import { ToolRegistry } from '../../src/registry/tool.registry.js';
import { ToolGroupManager } from '../../src/registry/tool.groups.js';
import { PromptRegistry } from '../../src/registry/prompt.registry.js';
import { SessionManager } from '../../src/session/session.manager.js';
import { MemoryToolCache } from '../../src/cache/memory.cache.js';
import { createAdminRoutes } from '../../src/routes/admin.routes.js';
import { newId } from '../../src/utils/uuid.js';
import { hashSecret } from '../../src/utils/crypto.js';
import { generateToken, computePrefix } from '../../src/identity/token.js';
import { bearerTokenMiddleware } from '../../src/middleware/auth/bearer-token.middleware.js';

async function setup() {
  const storage = await makeStorage();
  const cache = new MemoryToolCache();
  await cache.set('k1', { body: 'v', contentType: 'x' }, 60, { tool: 'db__q' });
  await cache.set('k2', { body: 'v', contentType: 'x' }, 60, { tool: 'db__q' });
  await cache.set('k3', { body: 'v', contentType: 'x' }, 60, { tool: 'fs__r' });
  const id = newId();
  await storage.principals.createServiceAccount({ id, displayName: 'a' });
  const raw = generateToken('sat', 'live');
  await storage.tokens.create({
    id: newId(), principalId: id, prefix: computePrefix(raw), hash: await hashSecret(raw),
  });
  const registry = new ToolRegistry(storage);
  const app = new Hono();
  app.use('*', bearerTokenMiddleware({ storage }));
  app.route('/api', createAdminRoutes({
    config: {} as never, storage, toolRegistry: registry,
    toolGroups: new ToolGroupManager(storage, registry),
    sessionManager: new SessionManager(),
    promptRegistry: new PromptRegistry(storage),
    cache,
  }));
  return { app, cache, storage, token: raw };
}

describe('POST /api/cache/invalidate', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { env = await setup(); });
  afterEach(async () => { await env.storage.close(); });

  it('invalidates by tool', async () => {
    const r = await env.app.request('/api/cache/invalidate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'db__q' }),
    });
    expect(r.status).toBe(200);
    const body = await r.json() as { invalidated: number };
    expect(body.invalidated).toBe(2);
    expect(await env.cache.get('k3')).not.toBeNull();
  });
});
