import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import type { JsonRpcRequest, JsonRpcResponse } from '../../src/types/mcp.js';
import { makeStorage } from '../fixtures/helpers/make-storage.js';
import { ToolRegistry } from '../../src/registry/tool.registry.js';
import { ToolGroupManager } from '../../src/registry/tool.groups.js';
import { PromptRegistry } from '../../src/registry/prompt.registry.js';
import { createMCPRoutes } from '../../src/routes/mcp.routes.js';
import { RedactionEngineFactory } from '../../src/redaction/factory.js';
import { seedBuiltinRedactionRules } from '../../src/redaction/seed.js';
import type { SqliteAdapter } from '../../src/storage/sqlite.adapter.js';

/** Minimal mock session manager that records what upstream received. */
class MockSessionManager {
  public lastRequest: JsonRpcRequest | undefined;
  public mockResult: unknown = { content: [{ type: 'text', text: 'ok' }] };
  async send(_server: string, req: JsonRpcRequest): Promise<JsonRpcResponse> {
    this.lastRequest = req;
    return { jsonrpc: '2.0', id: req.id ?? null, result: this.mockResult } as JsonRpcResponse;
  }
}

async function setup() {
  const storage = await makeStorage();
  await seedBuiltinRedactionRules(storage, 'tnt_default');

  // Register a server + tool so the registry resolves.
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
  const factory = new RedactionEngineFactory(storage);

  const app = new Hono();
  // Test middleware: stamp a minimal gatewayCtx so handler can set targetServer.
  app.use('*', async (c, next) => {
    c.set('gatewayCtx', { requestId: 'test-req-1' } as never);
    await next();
  });
  app.route('/mcp', createMCPRoutes({
    toolRegistry: registry,
    toolGroups: new ToolGroupManager(storage, registry),
    sessionManager: sessionMgr as never,
    promptRegistry: new PromptRegistry(storage),
    redactionFactory: factory,
    storage,
  }));
  return { app, storage, sessionMgr, factory };
}

describe('Redaction integration on /mcp tools/call', () => {
  let ctx: { app: Hono; storage: SqliteAdapter; sessionMgr: MockSessionManager; factory: RedactionEngineFactory };

  beforeEach(async () => { ctx = await setup() as never; });
  afterEach(async () => { await ctx.storage.close(); });

  it('redacts secret in request args before reaching upstream + records finding', async () => {
    const res = await ctx.app.request('/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'tools/call',
        params: {
          name: 'srv__echo',
          arguments: { token: 'AKIAIOSFODNN7EXAMPLE', other: 'safe' },
        },
      }),
    });
    expect(res.status).toBe(200);

    // Upstream received a redacted arg — no raw secret should be present.
    const upstreamArgs = (ctx.sessionMgr.lastRequest?.params as { arguments: Record<string, unknown> }).arguments;
    expect(JSON.stringify(upstreamArgs)).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(upstreamArgs.other).toBe('safe');

    // Findings table has a row but no leaked secret text.
    const findings = await ctx.storage.redactionFindings.list();
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => f.ruleId === 'aws_access_key' && f.scope === 'request')).toBe(true);
    for (const f of findings) {
      expect(JSON.stringify(f)).not.toContain('AKIAIOSFODNN7EXAMPLE');
    }
  });

  it('block-mode rule returns JSON-RPC error -32000 (Stripe live key)', async () => {
    const res = await ctx.app.request('/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 2, method: 'tools/call',
        params: {
          name: 'srv__echo',
          arguments: { key: 'sk_live_' + 'a'.repeat(24) },
        },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as JsonRpcResponse;
    expect('error' in body && body.error?.code).toBe(-32000);
    // Upstream NEVER received the blocked request.
    expect(ctx.sessionMgr.lastRequest).toBeUndefined();
  });

  it('scans response content and records response-scope finding', async () => {
    ctx.sessionMgr.mockResult = { content: [{ type: 'text', text: 'Found token: ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789' }] };

    const res = await ctx.app.request('/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 3, method: 'tools/call',
        params: { name: 'srv__echo', arguments: { q: 'list' } },
      }),
    });
    const body = await res.json() as JsonRpcResponse;
    expect(JSON.stringify(body)).not.toContain('ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789');
    const findings = await ctx.storage.redactionFindings.list();
    expect(findings.some((f) => f.scope === 'response' && f.ruleId === 'github_pat')).toBe(true);
  });
});
