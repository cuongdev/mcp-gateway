import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { makeStorage } from '../fixtures/helpers/make-storage.js';
import { createWebhooksRoutes } from '../../src/routes/admin/webhooks.routes.js';
import { newId } from '../../src/utils/uuid.js';
import { hashSecret } from '../../src/utils/crypto.js';
import { generateToken, computePrefix } from '../../src/identity/token.js';
import { bearerTokenMiddleware } from '../../src/middleware/auth/bearer-token.middleware.js';

async function setup() {
  const storage = await makeStorage();
  const id = newId();
  await storage.principals.createServiceAccount({ id, displayName: 'a' });
  const raw = generateToken('sat', 'live');
  await storage.tokens.create({
    id: newId(), principalId: id, prefix: computePrefix(raw), hash: await hashSecret(raw),
  });
  const app = new Hono();
  app.use('*', bearerTokenMiddleware({ storage }));
  app.route('/api/webhooks', createWebhooksRoutes({ storage }));
  return { app, storage, token: raw };
}

describe('GET /api/webhooks/events', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { env = await setup(); });
  afterEach(async () => { await env.storage.close(); });

  it('returns the list of known event names', async () => {
    const r = await env.app.request('/api/webhooks/events', {
      headers: { Authorization: `Bearer ${env.token}` },
    });
    expect(r.status).toBe(200);
    const body = await r.json() as { events: string[] };
    expect(body.events).toContain('approval.approved');
    expect(body.events).toContain('approval.rejected');
    expect(Array.isArray(body.events)).toBe(true);
  });
});
