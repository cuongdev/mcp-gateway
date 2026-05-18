import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { Hono } from 'hono';
import { makeStorage } from '../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../src/storage/sqlite.adapter.js';
import { ToolRegistry } from '../../src/registry/tool.registry.js';
import { ToolGroupManager } from '../../src/registry/tool.groups.js';
import { PromptRegistry } from '../../src/registry/prompt.registry.js';
import { SessionManager } from '../../src/session/session.manager.js';
import { newId } from '../../src/utils/uuid.js';
import { hashSecret } from '../../src/utils/crypto.js';
import { generateToken, computePrefix } from '../../src/identity/token.js';
import { bearerTokenMiddleware } from '../../src/middleware/auth/bearer-token.middleware.js';
import { createAdminRoutes } from '../../src/routes/admin.routes.js';

async function startMockApi(): Promise<{ server: Server; url: string }> {
  // Two-step listen: pick port, then build payload that references it.
  const tmp = createServer(() => {});
  await new Promise<void>((r) => tmp.listen(0, '127.0.0.1', r));
  const port = (tmp.address() as { port: number }).port;
  tmp.close();

  const server = createServer((req, res) => {
    if (req.url === '/openapi.json') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        openapi: '3.0.0',
        info: { title: 'pets', version: '1.0' },
        servers: [{ url: `http://127.0.0.1:${port}` }],
        paths: {
          '/pet/{id}': {
            get: {
              operationId: 'getPetById',
              parameters: [
                { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
              ],
              responses: {
                '200': {
                  description: 'ok',
                  content: { 'application/json': { schema: { type: 'object' } } },
                },
              },
            },
          },
        },
      }));
      return;
    }
    const m = req.url?.match(/^\/pet\/(\d+)$/);
    if (m) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ id: Number(m[1]), name: 'fluffy' }));
      return;
    }
    res.statusCode = 404;
    res.end('not found');
  });
  await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
  return { server, url: `http://127.0.0.1:${port}` };
}

describe('OpenAPI adapter integration', () => {
  let env: {
    server: Server;
    storage: SqliteAdapter;
    app: Hono;
    token: string;
    sessionManager: SessionManager;
    mockUrl: string;
  };

  beforeEach(async () => {
    const { server, url: mockUrl } = await startMockApi();
    const storage = await makeStorage();
    const id = newId();
    await storage.principals.createServiceAccount({ id, displayName: 'a' });
    const raw = generateToken('sat', 'live');
    await storage.tokens.create({
      id: newId(),
      principalId: id,
      prefix: computePrefix(raw),
      hash: await hashSecret(raw),
    });
    const registry = new ToolRegistry(storage);
    const groups = new ToolGroupManager(storage, registry);
    const sessionManager = new SessionManager();
    const promptRegistry = new PromptRegistry(storage);
    const app = new Hono();
    app.use('*', bearerTokenMiddleware({ storage }));
    app.route('/api', createAdminRoutes({
      config: {
        openapi: {
          enabled: true,
          allowedDomains: [],
          blockPrivateIps: false,
          maxResponseBytes: 10_000_000,
        },
      } as never,
      storage,
      toolRegistry: registry,
      toolGroups: groups,
      sessionManager,
      promptRegistry,
    }));
    env = { server, storage, app, token: raw, sessionManager, mockUrl };

    // Register the OpenAPI server
    const reg = await app.request('/api/servers', {
      method: 'POST',
      headers: { Authorization: `Bearer ${raw}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'pets',
        transport: {
          type: 'openapi',
          specUrl: `${mockUrl}/openapi.json`,
          baseUrl: mockUrl,
        },
      }),
    });
    expect(reg.status).toBe(201);
  });

  afterEach(async () => {
    await new Promise<void>((r) => env.server.close(() => r()));
    await env.sessionManager.shutdown();
    await env.storage.close();
  });

  it('persists the OpenAPI server with the discovered tool', async () => {
    const tool = await env.storage.tools.findByCanonicalName('pets__getPetById');
    expect(tool).not.toBeNull();
    expect(tool?.serverName).toBe('pets');
    expect(tool?.originalName).toBe('getPetById');
  });

  it('marks the server as openapi-backed in SessionManager', async () => {
    expect(env.sessionManager.isOpenApiServer('pets')).toBe(true);
    expect(env.sessionManager.has('pets')).toBe(true);
  });

  it('dispatches tools/call through the OpenAPI adapter', async () => {
    const res = await env.sessionManager.send('pets', {
      jsonrpc: '2.0',
      id: 'call-1',
      method: 'tools/call',
      params: { name: 'pets__getPetById', arguments: { id: 42 } },
    });
    expect(res.error).toBeUndefined();
    const result = res.result as {
      content: Array<{ type: string; text: string }>;
      structuredContent: { id: number; name: string };
    };
    expect(result.structuredContent).toEqual({ id: 42, name: 'fluffy' });
    expect(JSON.parse(result.content[0].text)).toEqual({ id: 42, name: 'fluffy' });
  });
});
