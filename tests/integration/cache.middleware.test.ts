import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { makeStorage } from '../fixtures/helpers/make-storage.js';
import { ToolRegistry } from '../../src/registry/tool.registry.js';
import { MemoryToolCache } from '../../src/cache/memory.cache.js';
import { cacheMiddleware } from '../../src/middleware/cache/cache.middleware.js';

async function setup() {
  const storage = await makeStorage();
  await storage.servers.upsert({
    name: 'db', transportType: 'streamable-http', transportConfig: { url: 'u' },
  });
  const registry = new ToolRegistry(storage);
  await registry.registerServerTools('db', [
    { name: 'q', description: '', inputSchema: {} },
  ]);
  await storage.tools.setCacheFlags('db__q', {
    cacheable: true, cacheTtlSec: 60, cachePerPrincipal: false,
  });
  await registry.load();
  const cache = new MemoryToolCache();
  return { storage, registry, cache };
}

describe('cache middleware', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { env = await setup(); });
  afterEach(async () => { await env.storage.close(); });

  it('second identical call hits cache', async () => {
    let upstreamCalls = 0;
    const app = new Hono();
    app.use('*', cacheMiddleware({ cache: env.cache, toolRegistry: env.registry, defaultTtlSec: 60 }));
    app.post('/mcp', (c) => {
      upstreamCalls++;
      return c.json({ result: { rows: [1, 2, 3] } });
    });

    const body = JSON.stringify({ method: 'tools/call', params: { name: 'db__q', arguments: { x: 1 } } });
    const r1 = await app.request('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    expect(r1.status).toBe(200);
    expect(r1.headers.get('x-mcp-cache')).toBe('miss');

    const r2 = await app.request('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    expect(r2.status).toBe(200);
    expect(r2.headers.get('x-mcp-cache')).toBe('hit');
    expect(upstreamCalls).toBe(1);
  });

  it('non-cacheable tool always hits upstream', async () => {
    await env.storage.tools.setCacheFlags('db__q', {
      cacheable: false, cacheTtlSec: null, cachePerPrincipal: false,
    });
    await env.registry.load();
    let upstreamCalls = 0;
    const app = new Hono();
    app.use('*', cacheMiddleware({ cache: env.cache, toolRegistry: env.registry, defaultTtlSec: 60 }));
    app.post('/mcp', (c) => { upstreamCalls++; return c.json({ result: 1 }); });
    const body = JSON.stringify({ method: 'tools/call', params: { name: 'db__q', arguments: { x: 1 } } });
    await app.request('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    await app.request('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    expect(upstreamCalls).toBe(2);
  });
});
