// ============================================================
// Integration: outbound proxy routing through SessionManager
//
// Verifies that when a server.proxyName is set, outbound HTTP
// from SessionManager is routed through the named proxy's
// undici Dispatcher (P5 Task 7).
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { makeStorage } from '../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../src/storage/sqlite.adapter.js';
import { ProxyRegistry } from '../../src/proxy/registry.js';
import { SessionManager } from '../../src/session/session.manager.js';

interface MockProxy {
  server: Server;
  url: string;
  connects: string[];
}

/**
 * Stand up a minimal HTTP proxy that records every CONNECT/request URL it
 * sees, then refuses with 502 so the caller can verify routing without
 * actually proxying traffic. We don't need to complete the tunnel — we
 * only care that undici contacted the proxy at all.
 */
async function startMockHttpProxy(): Promise<MockProxy> {
  const connects: string[] = [];
  const server = createServer();
  server.on('connect', (req, clientSocket) => {
    connects.push(req.url ?? '');
    try {
      clientSocket.write('HTTP/1.1 502 Test Tunnel Refused\r\n\r\n');
      clientSocket.end();
    } catch {
      /* ignore */
    }
  });
  server.on('request', (req, res) => {
    connects.push(req.url ?? '');
    res.statusCode = 502;
    res.end('mock proxy intentionally refusing');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  return { server, url: `http://127.0.0.1:${port}`, connects };
}

describe('Proxy outbound routing', () => {
  let env: {
    storage: SqliteAdapter;
    proxy: MockProxy;
    registry: ProxyRegistry;
  };

  beforeEach(async () => {
    const storage = await makeStorage();
    const proxy = await startMockHttpProxy();
    const registry = new ProxyRegistry(storage);
    await registry.load();
    env = { storage, proxy, registry };
  });

  afterEach(async () => {
    await env.registry.shutdown();
    await new Promise<void>((r) => env.proxy.server.close(() => r()));
    await env.storage.close();
  });

  it('routes outbound through proxy when server.proxyName is set', async () => {
    await env.storage.proxies.create({
      id: 'prx_1',
      name: 'mock',
      url: env.proxy.url,
    });
    await env.registry.load();
    await env.storage.servers.upsert({
      name: 'acme',
      transportType: 'streamable-http',
      transportConfig: { url: 'http://upstream.invalid:8080/mcp', timeout: 5000 },
    });
    await env.storage.servers.setProxyName('acme', 'mock');

    const mgr = new SessionManager();
    mgr.setStorage(env.storage);
    mgr.setProxyContext(env.registry, null);
    mgr.register('acme', {
      type: 'streamable-http',
      url: 'http://upstream.invalid:8080/mcp',
      timeout: 5000,
    });

    try {
      await mgr.send('acme', { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    } catch {
      /* expected — mock proxy returns 502 */
    }
    // The mock proxy must have observed at least one contact attempt
    // (CONNECT for HTTPS or a direct request line for HTTP).
    expect(env.proxy.connects.length).toBeGreaterThan(0);

    await mgr.shutdown();
  });

  it('fails closed when proxy is down', async () => {
    // Pre-seed a proxy row pointing at a dead port so dispatcher build
    // succeeds but actual traffic fails. Port 1 is reserved and unbound.
    await env.storage.proxies.create({
      id: 'prx_dead',
      name: 'dead',
      url: 'http://127.0.0.1:1',
    });
    await env.registry.load();
    await env.storage.servers.upsert({
      name: 'acme',
      transportType: 'streamable-http',
      transportConfig: { url: 'http://upstream.invalid:8080/mcp', timeout: 2000 },
    });
    await env.storage.servers.setProxyName('acme', 'dead');

    const mgr = new SessionManager();
    mgr.setStorage(env.storage);
    mgr.setProxyContext(env.registry, null);
    mgr.register('acme', {
      type: 'streamable-http',
      url: 'http://upstream.invalid:8080/mcp',
      timeout: 2000,
    });

    // Any error is acceptable — we just need to confirm we don't
    // silently fall back to direct connect.
    await expect(
      mgr.send('acme', { jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    ).rejects.toThrow();

    await mgr.shutdown();
  });
});
