import { describe, it, expect } from 'vitest';
import { SessionManager } from '../../src/session/session.manager.js';
import { createServer } from 'node:http';

describe('SessionManager HTTP session_mode', () => {
  it('stateless: does not send Mcp-Session-Id header on second request', async () => {
    const seenHeaders: Array<Record<string, string>> = [];
    const server = createServer((req, res) => {
      let buf = '';
      req.on('data', (c) => (buf += c));
      req.on('end', () => {
        const h: Record<string, string> = {};
        for (const k of Object.keys(req.headers)) h[k.toLowerCase()] = String(req.headers[k]);
        seenHeaders.push(h);
        res.setHeader('mcp-session-id', 'srv-session-' + seenHeaders.length);
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ result: { ok: true } }));
      });
    });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as { port: number }).port;

    const mgr = new SessionManager();
    mgr.register('s', {
      type: 'streamable-http',
      url: `http://127.0.0.1:${port}/mcp`,
      session_mode: 'stateless',
    });
    await mgr.send('s', { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    await mgr.send('s', { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(seenHeaders[0]['mcp-session-id']).toBeUndefined();
    expect(seenHeaders[1]['mcp-session-id']).toBeUndefined();
    server.close();
  });

  it('stateful: persists Mcp-Session-Id across calls', async () => {
    const seenHeaders: Array<Record<string, string>> = [];
    const server = createServer((req, res) => {
      let buf = '';
      req.on('data', (c) => (buf += c));
      req.on('end', () => {
        const h: Record<string, string> = {};
        for (const k of Object.keys(req.headers)) h[k.toLowerCase()] = String(req.headers[k]);
        seenHeaders.push(h);
        res.setHeader('mcp-session-id', 'srv-sess-42');
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ result: { ok: true } }));
      });
    });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as { port: number }).port;

    const mgr = new SessionManager();
    mgr.register('s', {
      type: 'streamable-http',
      url: `http://127.0.0.1:${port}/mcp`,
      session_mode: 'stateful',
    });
    await mgr.send('s', { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    await mgr.send('s', { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(seenHeaders[0]['mcp-session-id']).toBeUndefined();
    expect(seenHeaders[1]['mcp-session-id']).toBe('srv-sess-42');
    server.close();
  });

  it('headers are forwarded to upstream', async () => {
    const seenHeaders: Array<Record<string, string>> = [];
    const server = createServer((req, res) => {
      let buf = '';
      req.on('data', (c) => (buf += c));
      req.on('end', () => {
        const h: Record<string, string> = {};
        for (const k of Object.keys(req.headers)) h[k.toLowerCase()] = String(req.headers[k]);
        seenHeaders.push(h);
        res.setHeader('content-type', 'application/json');
        res.end('{}');
      });
    });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as { port: number }).port;

    const mgr = new SessionManager();
    mgr.register('s', {
      type: 'streamable-http',
      url: `http://127.0.0.1:${port}/mcp`,
      headers: { 'X-Tenant-Id': 'tenant-a' },
    });
    await mgr.send('s', { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(seenHeaders[0]['x-tenant-id']).toBe('tenant-a');
    server.close();
  });
});

describe('SessionManager idle cleanup', () => {
  it('accepts idleTimeoutSec option and shutdown clears it', async () => {
    const mgr = new SessionManager({ idleTimeoutSec: 60 });
    mgr.shutdown();
    // No assertion: success = no error, no hanging timer
  });
});
