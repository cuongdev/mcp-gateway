import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { makeStorage } from '../fixtures/helpers/make-storage.js';
import { ToolRegistry } from '../../src/registry/tool.registry.js';
import { ToolGroupManager } from '../../src/registry/tool.groups.js';
import { PromptRegistry } from '../../src/registry/prompt.registry.js';
import { SessionManager } from '../../src/session/session.manager.js';
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

  // Seed a server + one tool, then set cache flags on it.
  await storage.servers.upsert({ name: 'db', transportType: 'streamable-http', transportConfig: { url: 'http://x' } });
  await storage.tools.replaceServerTools('db', [{ originalName: 'query', description: 'q', inputSchema: {} }]);
  await storage.tools.setEnabled('db__query', true);
  await storage.tools.setCacheFlags('db__query', { cacheable: true, cacheTtlSec: 120, cachePerPrincipal: true });
  await storage.tools.setSensitive('db__query', true);

  const registry = new ToolRegistry(storage);
  await registry.load();
  const app = new Hono();
  app.use('*', bearerTokenMiddleware({ storage }));
  app.route('/api', createAdminRoutes({
    config: {} as GatewayConfig,
    storage,
    toolRegistry: registry,
    toolGroups: new ToolGroupManager(storage, registry),
    sessionManager: new SessionManager(),
    promptRegistry: new PromptRegistry(storage),
  }));
  return { app, storage, token: raw };
}

describe('GET /api/tools — cache + sensitive fields', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { env = await setup(); });
  afterEach(async () => { await env.storage.close(); });

  it('exposes cache + sensitive flags on each tool', async () => {
    const r = await env.app.request('/api/tools?all=true', {
      headers: { Authorization: `Bearer ${env.token}` },
    });
    expect(r.status).toBe(200);
    const body = await r.json() as { tools: Array<{ name: string; cacheable: boolean; cacheTtlSec: number | null; cachePerPrincipal: boolean; sensitive: boolean }>; total: number };
    expect(body.total).toBe(1);
    const t = body.tools[0];
    expect(t.name).toBe('db__query');
    expect(t.cacheable).toBe(true);
    expect(t.cacheTtlSec).toBe(120);
    expect(t.cachePerPrincipal).toBe(true);
    expect(t.sensitive).toBe(true);
  });
});
