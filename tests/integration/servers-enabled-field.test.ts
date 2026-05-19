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

  await storage.servers.upsert({ name: 'enabled-server', transportType: 'streamable-http', transportConfig: { url: 'http://x' } });
  await storage.tools.replaceServerTools('enabled-server', [{ originalName: 'q', description: '', inputSchema: {} }]);
  await storage.servers.upsert({ name: 'disabled-server', transportType: 'streamable-http', transportConfig: { url: 'http://y' } });
  await storage.tools.replaceServerTools('disabled-server', [{ originalName: 'q', description: '', inputSchema: {} }]);
  await storage.servers.setEnabled('disabled-server', false);

  const registry = new ToolRegistry(storage);
  await registry.load();
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

describe('GET /api/servers — enabled field', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { env = await setup(); });
  afterEach(async () => { await env.storage.close(); });

  it('exposes enabled flag for each server', async () => {
    const r = await env.app.request('/api/servers', {
      headers: { Authorization: `Bearer ${env.token}` },
    });
    expect(r.status).toBe(200);
    const body = await r.json() as { servers: Array<{ name: string; enabled: boolean }> };
    const map = new Map(body.servers.map((s) => [s.name, s.enabled]));
    expect(map.get('enabled-server')).toBe(true);
    expect(map.get('disabled-server')).toBe(false);
  });
});
