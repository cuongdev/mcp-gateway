import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { makeStorage } from '../fixtures/helpers/make-storage.js';
import { ToolRegistry } from '../../src/registry/tool.registry.js';
import { ToolGroupManager } from '../../src/registry/tool.groups.js';
import { PromptRegistry } from '../../src/registry/prompt.registry.js';
import { SessionManager } from '../../src/session/session.manager.js';
import { PolicyEngine } from '../../src/middleware/authz/policy.engine.js';
import { createAdminRoutes } from '../../src/routes/admin.routes.js';
import { RedactionEngineFactory } from '../../src/redaction/factory.js';
import { seedBuiltinRedactionRules } from '../../src/redaction/seed.js';
import { GatewayConfigSchema, type GatewayConfig } from '../../src/config/schema.js';
import type { SqliteAdapter } from '../../src/storage/sqlite.adapter.js';

async function setup() {
  const storage = await makeStorage();
  await seedBuiltinRedactionRules(storage, 'tnt_default');

  const config: GatewayConfig = GatewayConfigSchema.parse({
    mode: 'development',
    gateway: { port: 3001, host: '127.0.0.1' },
    authorization: { enabled: false, modelFile: './config/policy.model.conf', policyFile: './config/policy.csv' },
  });
  const policyEngine = new PolicyEngine({ storage, modelFile: config.authorization.modelFile });
  await policyEngine.load();

  const registry = new ToolRegistry(storage);
  const factory = new RedactionEngineFactory(storage);
  const app = new Hono();
  app.route('/api', createAdminRoutes({
    config, storage,
    toolRegistry: registry,
    toolGroups: new ToolGroupManager(storage, registry),
    sessionManager: new SessionManager(),
    promptRegistry: new PromptRegistry(storage),
    policyEngine,
    redactionFactory: factory,
  }));
  return { app, storage, factory };
}

describe('Redaction admin routes', () => {
  let ctx: { app: Hono; storage: SqliteAdapter; factory: RedactionEngineFactory };

  beforeEach(async () => { ctx = await setup() as never; });
  afterEach(async () => { await ctx.storage.close(); });

  it('GET /api/redaction/rules returns seeded built-ins', async () => {
    const res = await ctx.app.request('/api/redaction/rules');
    expect(res.status).toBe(200);
    const body = await res.json() as { rules: unknown[] };
    expect(body.rules.length).toBeGreaterThanOrEqual(22);
  });

  it('POST /api/redaction/rules — custom rule create + 409 on conflict', async () => {
    const create = await ctx.app.request('/api/redaction/rules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'my-custom', kind: 'custom.foo',
        pattern: 'FOOBAR-[0-9]{6}', mode: 'redact',
      }),
    });
    expect(create.status).toBe(201);
    const created = await create.json() as { id: string };
    expect(created.id).toBeDefined();

    // Conflict on second create with same name
    const dup = await ctx.app.request('/api/redaction/rules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'my-custom', kind: 'k', pattern: 'x' }),
    });
    expect(dup.status).toBe(409);
  });

  it('POST /rules rejects unsafe regex', async () => {
    const res = await ctx.app.request('/api/redaction/rules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'bad', kind: 'k', pattern: '(a+)+b' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('unsafe_pattern');
  });

  it('PATCH built-in rule allows mode/enabled, blocks other fields', async () => {
    const ok = await ctx.app.request('/api/redaction/rules/aws_access_key', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'block' }),
    });
    expect(ok.status).toBe(200);
    const row = await ctx.storage.redactionRules.findById('aws_access_key');
    expect(row?.mode).toBe('block');

    const bad = await ctx.app.request('/api/redaction/rules/aws_access_key', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pattern: 'NEWPAT' }),
    });
    expect(bad.status).toBe(403);
  });

  it('DELETE built-in rule forbidden; custom rule succeeds', async () => {
    const forbidden = await ctx.app.request('/api/redaction/rules/aws_access_key', { method: 'DELETE' });
    expect(forbidden.status).toBe(403);

    // Create then delete a custom rule
    const c = await ctx.app.request('/api/redaction/rules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'temp', kind: 'k', pattern: 'TEMP' }),
    });
    const { id } = await c.json() as { id: string };
    const del = await ctx.app.request(`/api/redaction/rules/${id}`, { method: 'DELETE' });
    expect(del.status).toBe(200);
  });

  it('POST /test scans text and returns findings + redacted output', async () => {
    const res = await ctx.app.request('/api/redaction/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'My key is AKIAIOSFODNN7EXAMPLE and email is alice@example.com',
        scope: 'request',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { redacted: string; findings: Array<{ kind: string }> };
    expect(body.redacted).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(body.findings.find((f) => f.kind === 'api_key.aws_access_key')).toBeDefined();
    expect(body.findings.find((f) => f.kind === 'pii.email')).toBeDefined();
  });

  it('GET /findings returns recorded findings', async () => {
    await ctx.storage.redactionFindings.recordMany([
      { id: 'f1', ruleId: 'aws_access_key', requestId: 'req1', scope: 'request', mode: 'redact', matchCount: 1, serverName: 's1' },
    ]);
    const res = await ctx.app.request('/api/redaction/findings');
    expect(res.status).toBe(200);
    const body = await res.json() as { findings: Array<{ id: string }> };
    expect(body.findings.length).toBe(1);
    expect(body.findings[0].id).toBe('f1');
  });

  it('GET /stats returns counts by rule + server', async () => {
    const now = Date.now();
    await ctx.storage.redactionFindings.recordMany([
      { id: 'a', ruleId: 'r1', requestId: 'q', scope: 'request', mode: 'redact', matchCount: 3, serverName: 's1', occurredAt: now },
      { id: 'b', ruleId: 'r2', requestId: 'q', scope: 'request', mode: 'redact', matchCount: 1, serverName: 's2', occurredAt: now },
    ]);
    const res = await ctx.app.request('/api/redaction/stats?since=1h');
    expect(res.status).toBe(200);
    const body = await res.json() as { byRule: Array<{ ruleId: string; count: number }>; byServer: Array<{ count: number }> };
    expect(body.byRule.find((r) => r.ruleId === 'r1')?.count).toBe(3);
    expect(body.byServer.length).toBe(2);
  });
});
