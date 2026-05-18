import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { makeStorage } from '../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../src/storage/sqlite.adapter.js';
import { buildMiddlewarePipeline } from '../../src/middleware/index.js';
import { newId } from '../../src/utils/uuid.js';
import { hashSecret } from '../../src/utils/crypto.js';
import { generateToken, computePrefix } from '../../src/identity/token.js';

async function makeTokenFor(storage: SqliteAdapter) {
  const principalId = newId();
  await storage.principals.createServiceAccount({ id: principalId, displayName: 'a' });
  const raw = generateToken('sat', 'live');
  await storage.tokens.create({
    id: newId(), principalId, prefix: computePrefix(raw), hash: await hashSecret(raw),
  });
  return { principalId, raw };
}

describe('middleware pipeline (P0 auth)', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => { storage = await makeStorage(); });
  afterEach(async () => { await storage.close(); });

  it('dev mode: no token required; anonymous principal injected', async () => {
    const app = new Hono();
    buildMiddlewarePipeline(app, {
      mode: 'development', auth: { requireAuthForApi: false, requireAuthForMcp: false },
    } as never, { storage });
    app.get('/api/whoami', (c) => c.json({ p: c.get('principal') }));
    const r = await app.request('/api/whoami');
    expect(r.status).toBe(200);
    const body = await r.json() as { p: { id: string } };
    expect(body.p.id).toBe('dev');
  });

  it('enterprise mode: missing token → 401', async () => {
    const app = new Hono();
    buildMiddlewarePipeline(app, {
      mode: 'enterprise', auth: { requireAuthForApi: true, requireAuthForMcp: true },
    } as never, { storage });
    app.get('/api/whoami', (c) => c.json({ ok: true }));
    const r = await app.request('/api/whoami');
    expect(r.status).toBe(401);
  });

  it('enterprise mode: valid token → 200', async () => {
    const app = new Hono();
    buildMiddlewarePipeline(app, {
      mode: 'enterprise', auth: { requireAuthForApi: true, requireAuthForMcp: true },
    } as never, { storage });
    app.get('/api/whoami', (c) => c.json({ p: c.get('principal') }));
    const { principalId, raw } = await makeTokenFor(storage);
    const r = await app.request('/api/whoami', { headers: { Authorization: `Bearer ${raw}` } });
    expect(r.status).toBe(200);
    const body = await r.json() as { p: { id: string } };
    expect(body.p.id).toBe(principalId);
  });
});
