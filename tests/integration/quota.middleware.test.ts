import { describe, it, expect, afterEach } from 'vitest';
import { Hono } from 'hono';
import { makeStorage } from '../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../src/storage/sqlite.adapter.js';
import { newId } from '../../src/utils/uuid.js';
import { hashSecret } from '../../src/utils/crypto.js';
import { generateToken, computePrefix } from '../../src/identity/token.js';
import { bearerTokenMiddleware } from '../../src/middleware/auth/bearer-token.middleware.js';
import { quotaMiddleware } from '../../src/middleware/quota/quota.middleware.js';
import { QuotaService } from '../../src/quota/index.js';

async function setup(daily: number) {
  const storage = await makeStorage();
  const id = newId();
  await storage.principals.createServiceAccount({ id, displayName: 'a' });
  const raw = generateToken('sat', 'live');
  await storage.tokens.create({
    id: newId(), principalId: id, prefix: computePrefix(raw), hash: await hashSecret(raw),
  });
  const q = new QuotaService(storage, { enabled: true, default: { daily }, overrides: [] });
  const app = new Hono();
  app.use('*', bearerTokenMiddleware({ storage }));
  app.use('*', quotaMiddleware({ quota: q }));
  app.post('/mcp', (c) => c.json({ ok: true }));
  return { app, storage, token: raw };
}

describe('quota middleware', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  afterEach(async () => { await env.storage.close(); });

  it('denies the N+1 tools/call when daily=N', async () => {
    env = await setup(2);
    for (let i = 0; i < 2; i++) {
      const r = await env.app.request('/mcp', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'tools/call', params: { name: 'x__y' } }),
      });
      expect(r.status).toBe(200);
    }
    const r3 = await env.app.request('/mcp', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'tools/call', params: { name: 'x__y' } }),
    });
    expect(r3.status).toBe(429);
    expect(r3.headers.get('x-quota-reset')).toBeTruthy();
  });

  it('tools/list bypasses quota', async () => {
    env = await setup(1);
    for (let i = 0; i < 3; i++) {
      const r = await env.app.request('/mcp', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'tools/list' }),
      });
      expect(r.status).toBe(200);
    }
  });
});
