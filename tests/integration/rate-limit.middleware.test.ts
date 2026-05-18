import { describe, it, expect, afterEach } from 'vitest';
import { Hono } from 'hono';
import { makeStorage } from '../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../src/storage/sqlite.adapter.js';
import { newId } from '../../src/utils/uuid.js';
import { hashSecret } from '../../src/utils/crypto.js';
import { generateToken, computePrefix } from '../../src/identity/token.js';
import { bearerTokenMiddleware } from '../../src/middleware/auth/bearer-token.middleware.js';
import { rateLimitMiddleware } from '../../src/middleware/rate-limit/rate-limit.middleware.js';
import { RateLimiter } from '../../src/ratelimit/index.js';
import { MemoryRateLimitBackend } from '../../src/ratelimit/memory.backend.js';
import type { Rule } from '../../src/ratelimit/rules.js';

async function setup(rules: Rule[], defaultLimit = '1000/min') {
  const storage = await makeStorage();
  const id = newId();
  await storage.principals.createServiceAccount({ id, displayName: 'a' });
  const raw = generateToken('sat', 'live');
  await storage.tokens.create({
    id: newId(), principalId: id, prefix: computePrefix(raw), hash: await hashSecret(raw),
  });
  const rateLimiter = new RateLimiter({
    rules, defaultLimit, backend: new MemoryRateLimitBackend(),
  });
  const app = new Hono();
  app.use('*', bearerTokenMiddleware({ storage }));
  app.use('*', rateLimitMiddleware({ rateLimiter }));
  app.post('/mcp', (c) => c.json({ ok: true }));
  return { app, storage, token: raw };
}

describe('rate-limit middleware', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  afterEach(async () => { await env.storage.close(); });

  it('rejects 11th tools/call when rule = 10/min', async () => {
    env = await setup([{ tool: 'db__delete', limit: '10/min' }]);
    for (let i = 0; i < 10; i++) {
      const r = await env.app.request('/mcp', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'tools/call', params: { name: 'db__delete' } }),
      });
      expect(r.status).toBe(200);
    }
    const r11 = await env.app.request('/mcp', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'tools/call', params: { name: 'db__delete' } }),
    });
    expect(r11.status).toBe(429);
    expect(r11.headers.get('retry-after')).toBeTruthy();
    expect(r11.headers.get('x-ratelimit-remaining')).toBe('0');
  });

  it('non-tools/call requests bypass rate limit', async () => {
    env = await setup([{ tool: '*', limit: '1/min' }]);
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
