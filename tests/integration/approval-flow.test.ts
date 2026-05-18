import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { makeStorage } from '../fixtures/helpers/make-storage.js';
import { ToolRegistry } from '../../src/registry/tool.registry.js';
import { newId } from '../../src/utils/uuid.js';
import { hashSecret } from '../../src/utils/crypto.js';
import { generateToken, computePrefix } from '../../src/identity/token.js';
import { bearerTokenMiddleware } from '../../src/middleware/auth/bearer-token.middleware.js';
import { approvalGateMiddleware } from '../../src/middleware/approval/approval-gate.middleware.js';
import { ApprovalService } from '../../src/approval/index.js';
import { createApprovalsRoutes } from '../../src/routes/admin/approvals.routes.js';

async function setup() {
  const storage = await makeStorage();
  await storage.servers.upsert({ name: 'db', transportType: 'streamable-http', transportConfig: { url: 'u' } });
  const registry = new ToolRegistry(storage);
  await registry.registerServerTools('db', [{ name: 'delete', description: '', inputSchema: {} }]);
  await storage.tools.setSensitive('db__delete', true);
  await registry.load();

  const callerId = newId();
  await storage.principals.createServiceAccount({ id: callerId, displayName: 'caller' });
  const callerRaw = generateToken('sat', 'live');
  await storage.tokens.create({
    id: newId(), principalId: callerId, prefix: computePrefix(callerRaw), hash: await hashSecret(callerRaw),
  });

  const adminId = newId();
  await storage.principals.createServiceAccount({ id: adminId, displayName: 'admin' });
  const adminRaw = generateToken('sat', 'live');
  await storage.tokens.create({
    id: newId(), principalId: adminId, prefix: computePrefix(adminRaw), hash: await hashSecret(adminRaw),
  });

  const svc = new ApprovalService(storage, { enabled: true, defaultTtlSec: 60, approverRoles: ['admin'] });

  const app = new Hono();
  app.use('*', bearerTokenMiddleware({ storage }));
  app.use('/mcp', approvalGateMiddleware({ approvalService: svc, toolRegistry: registry }));
  app.post('/mcp', (c) => c.json({ result: 'executed' }));
  app.route('/api/approvals', createApprovalsRoutes({ approvalService: svc }));
  return { app, storage, svc, registry, callerRaw, adminRaw };
}

describe('approval flow', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { env = await setup(); });
  afterEach(async () => { await env.storage.close(); });

  it('sensitive tool call returns 202 approval_required', async () => {
    const r = await env.app.request('/mcp', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.callerRaw}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'tools/call', params: { name: 'db__delete', arguments: { id: 1 } } }),
    });
    expect(r.status).toBe(202);
    const body = await r.json() as { error: { data: { approval_id: string } } };
    expect(body.error.data.approval_id).toMatch(/^app_/);
  });

  it('approve flips status to approved', async () => {
    const r1 = await env.app.request('/mcp', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.callerRaw}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'tools/call', params: { name: 'db__delete' } }),
    });
    const body = await r1.json() as { error: { data: { approval_id: string } } };
    const id = body.error.data.approval_id;

    const r2 = await env.app.request(`/api/approvals/${id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.adminRaw}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'ok' }),
    });
    expect(r2.status).toBe(200);

    const r3 = await env.app.request(`/api/approvals/${id}`, {
      headers: { Authorization: `Bearer ${env.adminRaw}` },
    });
    const detail = await r3.json() as { status: string };
    expect(detail.status).toBe('approved');
  });

  it('reject works and second decide returns 409', async () => {
    const r1 = await env.app.request('/mcp', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.callerRaw}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'tools/call', params: { name: 'db__delete' } }),
    });
    const id = ((await r1.json()) as { error: { data: { approval_id: string } } }).error.data.approval_id;

    await env.app.request(`/api/approvals/${id}/reject`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.adminRaw}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const r3 = await env.app.request(`/api/approvals/${id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.adminRaw}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(r3.status).toBe(409);
  });

  it('post-approval execution: caller reissues call with X-MCP-Approval-Id header → upstream called', async () => {
    const r1 = await env.app.request('/mcp', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.callerRaw}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'tools/call', params: { name: 'db__delete', arguments: { id: 1 } } }),
    });
    const id = ((await r1.json()) as { error: { data: { approval_id: string } } }).error.data.approval_id;

    await env.app.request(`/api/approvals/${id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.adminRaw}`, 'Content-Type': 'application/json' },
      body: '{}',
    });

    const r3 = await env.app.request('/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.callerRaw}`,
        'Content-Type': 'application/json',
        'X-MCP-Approval-Id': id,
      },
      body: JSON.stringify({ method: 'tools/call', params: { name: 'db__delete', arguments: { id: 1 } } }),
    });
    expect(r3.status).toBe(200);
    const body = await r3.json() as { result: string };
    expect(body.result).toBe('executed');
  });
});
