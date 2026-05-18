import { describe, it, expect, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { createStorage } from '../../src/storage/index.js';
import type { StorageAdapter } from '../../src/storage/adapter.js';
import { Gateway } from '../../src/gateway.js';
import { newId } from '../../src/utils/uuid.js';
import { hashSecret } from '../../src/utils/crypto.js';
import { generateToken, computePrefix } from '../../src/identity/token.js';

const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs.length = 0;
});

async function makeAdminToken(storage: StorageAdapter) {
  const principalId = newId();
  await storage.principals.createServiceAccount({
    id: principalId, displayName: 'admin', isBootstrap: true,
  });
  await storage.policies.replaceAll([
    { ptype: 'p', values: ['role:admin', '*', '*'] },
    { ptype: 'g', values: [principalId, 'role:admin'] },
  ]);
  const raw = generateToken('sat', 'live');
  await storage.tokens.create({
    id: newId(), principalId, prefix: computePrefix(raw), hash: await hashSecret(raw),
  });
  return raw;
}

function makeConfig(dbPath: string) {
  return {
    mode: 'enterprise',
    gateway: {
      port: 0, host: '0.0.0.0', mcpPath: '/mcp', apiPath: '/api',
      corsOrigins: ['*'], requestTimeout: 30000,
    },
    storage: { driver: 'sqlite', path: dbPath, url: null, authToken: null },
    auth: {
      bearerTokenHeader: 'Authorization',
      requireAuthForApi: true,
      requireAuthForMcp: true,
    },
    audit: {
      enabled: false, storage: 'file', logPath: '', maxFileSize: 0,
      retentionDays: 0, fileExport: false, fileExportPath: '',
    },
    authorization: {
      enabled: false,
      modelFile: './config/policy.model.conf',
      policyFile: './config/policy.csv',
      defaultDecision: 'allow',
      cache: { enabled: false, ttl: 600 },
    },
    monitoring: {
      metricsEnabled: false, metricsPort: 9090,
      metricsPath: '/metrics', healthCheckPath: '/health',
    },
    session: { cookieName: 'mcp_session', ttl: 28800, secure: false, sameSite: 'lax' },
    servers: [], groups: [], oidcProviders: [],
  } as never;
}

async function hydrate(gw: Gateway, storage: StorageAdapter) {
  await gw.getToolRegistry().load();
  await gw.getToolGroups().load();
  await gw.getSessionManager().loadFromStorage(storage);
  await gw.getPolicyEngine().load();
}

describe('bootstrap and register (E2E)', () => {
  it('register server, restart gateway, server still listed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-e2e-'));
    dirs.push(dir);
    const dbPath = join(dir, 'e2e.sqlite');
    const cfg = makeConfig(dbPath);

    // ── Phase 1: bootstrap + register ──────────────────
    const storage1 = await createStorage({ driver: 'sqlite', path: dbPath });
    const token = await makeAdminToken(storage1);

    const gw1 = new Gateway(cfg, storage1);
    await hydrate(gw1, storage1);
    const app1 = gw1.getApp();

    const reg = await app1.request('/api/servers', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'echo',
        transport: { type: 'streamable-http', url: 'http://localhost:9999/mcp' },
        autoDiscover: false,
      }),
    });
    // POST /api/servers returns 201 (created) — discovery failure still returns 201 with warning.
    expect(reg.status).toBe(201);

    // Confirm the server is persisted in the DB before we shut down.
    const persisted = await storage1.servers.list();
    expect(persisted.map((s) => s.name)).toContain('echo');

    await storage1.close();

    // ── Phase 2: fresh storage + gateway pointing at same file ─
    const storage2 = await createStorage({ driver: 'sqlite', path: dbPath });
    const gw2 = new Gateway(cfg, storage2);
    await hydrate(gw2, storage2);

    // Verify persistence at the storage layer — this is the headline P0 claim.
    const survived = await storage2.servers.list();
    expect(survived.map((s) => s.name)).toContain('echo');

    // The SessionManager should have re-registered the server from storage.
    expect(gw2.getSessionManager().has('echo')).toBe(true);

    // And the admin token created in Phase 1 should still authenticate in Phase 2.
    const list = await gw2.getApp().request('/api/servers', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(list.status).toBe(200);
    const body = await list.json() as { servers: Array<{ name: string }> };
    // The HTTP response aggregates from the tool registry. Tool discovery failed
    // in Phase 1 (no upstream server at :9999), so the response may be empty —
    // the proof of persistence lives in storage.servers.list() and sessionManager
    // assertions above. We just check the endpoint responds without error.
    expect(Array.isArray(body.servers)).toBe(true);

    await storage2.close();
  });
});
