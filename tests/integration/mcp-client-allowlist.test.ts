import { describe, it, expect, afterEach } from 'vitest';
import { Hono } from 'hono';
import { makeStorage } from '../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../src/storage/sqlite.adapter.js';
import { newId } from '../../src/utils/uuid.js';
import { hashSecret } from '../../src/utils/crypto.js';
import { generateToken, computePrefix } from '../../src/identity/token.js';
import { bearerTokenMiddleware } from '../../src/middleware/auth/bearer-token.middleware.js';
import { mcpClientAllowlistMiddleware } from '../../src/middleware/authz/mcp-client-allowlist.middleware.js';

async function setup(allowedServers: string[]) {
  const storage = await makeStorage();
  await storage.servers.upsert({ name: 'db', transportType: 'streamable-http', transportConfig: { url: 'u' } });
  await storage.servers.upsert({ name: 'fs', transportType: 'stdio', transportConfig: { command: 'n' } });

  const id = newId();
  await storage.principals.createMCPClient({ id, displayName: 'c', allowedServers });
  const raw = generateToken('mct', 'live');
  await storage.tokens.create({
    id: newId(), principalId: id, prefix: computePrefix(raw), hash: await hashSecret(raw),
  });
  return { storage, token: raw };
}

describe('MCP client allowlist enforcement', () => {
  let env: { storage: SqliteAdapter; token: string };
  afterEach(async () => { await env.storage.close(); });

  it('allows tool call when server in allowedServers', async () => {
    env = await setup(['db']);
    const app = new Hono();
    app.use('*', bearerTokenMiddleware({ storage: env.storage }));
    app.use('*', mcpClientAllowlistMiddleware());
    app.post('/mcp', async (c) => {
      const body = await c.req.json() as { params: { name: string } };
      return c.json({ tool: body.params.name });
    });

    const r = await app.request('/mcp', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'tools/call', params: { name: 'db__query' } }),
    });
    expect(r.status).toBe(200);
  });

  it('blocks tool call when server NOT in allowedServers', async () => {
    env = await setup(['db']);
    const app = new Hono();
    app.use('*', bearerTokenMiddleware({ storage: env.storage }));
    app.use('*', mcpClientAllowlistMiddleware());
    app.post('/mcp', (c) => c.json({ ok: true }));

    const r = await app.request('/mcp', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'tools/call', params: { name: 'fs__read' } }),
    });
    expect(r.status).toBe(403);
    const body = await r.json() as { error: { code: string } };
    expect(body.error.code).toBe('server_not_allowed');
  });

  it('allows any server when allowedServers contains "*"', async () => {
    env = await setup(['*']);
    const app = new Hono();
    app.use('*', bearerTokenMiddleware({ storage: env.storage }));
    app.use('*', mcpClientAllowlistMiddleware());
    app.post('/mcp', (c) => c.json({ ok: true }));

    const r = await app.request('/mcp', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'tools/call', params: { name: 'fs__read' } }),
    });
    expect(r.status).toBe(200);
  });

  it('non-MCPClient principals bypass the check', async () => {
    const storage = await makeStorage();
    const id = newId();
    await storage.principals.createServiceAccount({ id, displayName: 'admin' });
    const raw = generateToken('sat', 'live');
    await storage.tokens.create({
      id: newId(), principalId: id, prefix: computePrefix(raw), hash: await hashSecret(raw),
    });
    env = { storage, token: raw };

    const app = new Hono();
    app.use('*', bearerTokenMiddleware({ storage }));
    app.use('*', mcpClientAllowlistMiddleware());
    app.post('/mcp', (c) => c.json({ ok: true }));

    const r = await app.request('/mcp', {
      method: 'POST',
      headers: { Authorization: `Bearer ${raw}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'tools/call', params: { name: 'anything__yes' } }),
    });
    expect(r.status).toBe(200);
  });
});
