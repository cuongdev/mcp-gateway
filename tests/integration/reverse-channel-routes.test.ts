import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import type { JsonRpcRequest, JsonRpcResponse } from '../../src/types/mcp.js';
import { makeStorage } from '../fixtures/helpers/make-storage.js';
import { ToolRegistry } from '../../src/registry/tool.registry.js';
import { ToolGroupManager } from '../../src/registry/tool.groups.js';
import { PromptRegistry } from '../../src/registry/prompt.registry.js';
import { createMCPRoutes } from '../../src/routes/mcp.routes.js';
import { ReverseChannelMux } from '../../src/pipeline/reverse-channel.js';
import type { SqliteAdapter } from '../../src/storage/sqlite.adapter.js';
import type { SseWriter } from '../../src/transport/sse-writer.js';

/**
 * Mock session manager that records the `originatingSessionId` the route
 * passes to `send()` — that's the value that becomes `_meta.session_id` on
 * the upstream call, so it's exactly what we need to assert C3.
 */
class MockSessionManager {
  public lastOriginatingSessionId: string | undefined;
  async send(
    _server: string,
    req: JsonRpcRequest,
    opts?: { originatingSessionId?: string },
  ): Promise<JsonRpcResponse> {
    this.lastOriginatingSessionId = opts?.originatingSessionId;
    return { jsonrpc: '2.0', id: req.id ?? null, result: { content: [{ type: 'text', text: 'ok' }] } };
  }
}

function makeMockWriter(): SseWriter & { sent: unknown[] } {
  const sent: unknown[] = [];
  let _closed = false;
  return {
    sent,
    get closed() { return _closed; },
    send(json: unknown) { if (!_closed) sent.push(json); },
    close() { _closed = true; },
  };
}

async function setup() {
  const storage = await makeStorage();
  await storage.servers.upsert({
    name: 'srv',
    transportType: 'streamable-http',
    transportConfig: { url: 'http://localhost:0' },
  });
  await storage.tools.replaceServerTools('srv', [{
    originalName: 'echo',
    description: 'echo',
    inputSchema: { type: 'object' },
  }]);
  const registry = new ToolRegistry(storage);
  await registry.load();

  const sessionMgr = new MockSessionManager();
  const mux = new ReverseChannelMux();

  const app = new Hono();
  // Stamp a gatewayCtx whose requestId is DELIBERATELY different from any
  // Mcp-Session-Id header — proving the route binds on the header, not the
  // per-request id.
  app.use('*', async (c, next) => {
    c.set('gatewayCtx', { requestId: `req-${uuidv4()}` } as never);
    await next();
  });
  app.route('/mcp', createMCPRoutes({
    toolRegistry: registry,
    toolGroups: new ToolGroupManager(storage, registry),
    sessionManager: sessionMgr as never,
    promptRegistry: new PromptRegistry(storage),
    storage,
    reverseChannel: mux,
  }));
  return { app, storage, sessionMgr, mux };
}

describe('Reverse-channel route wiring', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { ctx = await setup(); });
  afterEach(async () => { await ctx.storage.close(); });

  it('C3: binds _meta.session_id to the Mcp-Session-Id header, not requestId', async () => {
    const res = await ctx.app.request('/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'mcp-session-id': 'client-session-42' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'tools/call',
        params: { name: 'srv__echo', arguments: {} },
      }),
    });
    expect(res.status).toBe(200);
    // The echoed session header is the stable client id, not the requestId.
    expect(res.headers.get('Mcp-Session-Id')).toBe('client-session-42');
    // The value injected toward the upstream is the same stable id.
    expect(ctx.sessionMgr.lastOriginatingSessionId).toBe('client-session-42');
  });

  it('C1+C2: a JSON-RPC response from the owning session resolves the pending reverse request', async () => {
    const writer = makeMockWriter();
    ctx.mux.registerClient('client-session-42', writer);
    const upstreamPromise = ctx.mux.forwardFromUpstream('srv', 'client-session-42', {
      jsonrpc: '2.0', id: 'rev-9', method: 'sampling/createMessage',
      params: { _meta: { session_id: 'client-session-42' }, messages: [] },
    });
    expect(ctx.mux.pendingCountFor('client-session-42')).toBe(1);

    const res = await ctx.app.request('/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'mcp-session-id': 'client-session-42' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'rev-9', result: { role: 'assistant', content: 'hi' } }),
    });
    // MCP Streamable HTTP: a response-only POST is acknowledged with 202.
    expect(res.status).toBe(202);
    expect(await upstreamPromise).toEqual({ jsonrpc: '2.0', id: 'rev-9', result: { role: 'assistant', content: 'hi' } });
    expect(ctx.mux.pendingCountFor('client-session-42')).toBe(0);
  });

  it('C2: a response from a different session does NOT resolve another session\'s reverse request', async () => {
    const writer = makeMockWriter();
    ctx.mux.registerClient('victim', writer);
    const upstreamPromise = ctx.mux.forwardFromUpstream('srv', 'victim', {
      jsonrpc: '2.0', id: 'rev-secret', method: 'sampling/createMessage',
      params: { _meta: { session_id: 'victim' }, messages: [] },
    });
    let settled = false;
    upstreamPromise.then(() => { settled = true; }, () => { settled = true; });

    // Attacker POSTs a forged response with the victim's requestId but its own session.
    const res = await ctx.app.request('/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'mcp-session-id': 'attacker' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'rev-secret', result: 'STOLEN' }),
    });
    // Route still acks 202 (it doesn't leak whether a match existed)...
    expect(res.status).toBe(202);
    // ...but the victim's request is untouched.
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(ctx.mux.pendingCountFor('victim')).toBe(1);

    // Clean up so the pending promise doesn't dangle past the test.
    ctx.mux.failAllForSession('victim', new Error('test_cleanup'));
    await upstreamPromise.catch(() => undefined);
  });
});
