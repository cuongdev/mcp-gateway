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
  for (let i = 0; i < 5; i++) {
    await storage.audit.write({
      id: newId(), action: 'tool.call', resource: 'db__query', result: 'success',
    });
  }
  for (let i = 0; i < 2; i++) {
    await storage.audit.write({
      id: newId(), action: 'tool.call', resource: 'fs__read', result: 'success',
    });
  }
  await storage.audit.write({
    id: newId(), action: 'tool.call', resource: 'db__query', result: 'denied',
  });

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
    promptRegistry: new PromptRegistry(storage),
  }));
  return { app, storage, token: raw };
}

describe('GET /api/usage', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { env = await setup(); });
  afterEach(async () => { await env.storage.close(); });

  it('aggregates by tool', async () => {
    const r = await env.app.request('/api/usage?by=tool', {
      headers: { Authorization: `Bearer ${env.token}` },
    });
    expect(r.status).toBe(200);
    const body = await r.json() as { series: Array<{ key: string; total: number; success: number; denied: number }> };
    const db = body.series.find((s) => s.key === 'db__query');
    expect(db?.total).toBe(6);
    expect(db?.success).toBe(5);
    expect(db?.denied).toBe(1);
    const fs = body.series.find((s) => s.key === 'fs__read');
    expect(fs?.total).toBe(2);
  });

  it('respects since/until window', async () => {
    const future = Date.now() + 60_000;
    const r = await env.app.request(`/api/usage?by=tool&since=${future}`, {
      headers: { Authorization: `Bearer ${env.token}` },
    });
    const body = await r.json() as { series: Array<unknown> };
    expect(body.series.length).toBe(0);
  });
});
