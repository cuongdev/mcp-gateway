import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { makeStorage } from '../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../src/storage/sqlite.adapter.js';
import { newId } from '../../../src/utils/uuid.js';
import { hashSecret } from '../../../src/utils/crypto.js';
import { generateToken, computePrefix } from '../../../src/identity/token.js';
import { bearerTokenMiddleware } from '../../../src/middleware/auth/bearer-token.middleware.js';

async function makeAppWithToken(storage: SqliteAdapter) {
  const principalId = newId();
  await storage.principals.createServiceAccount({ id: principalId, displayName: 'admin' });
  const raw = generateToken('sat', 'live');
  await storage.tokens.create({
    id: newId(), principalId, prefix: computePrefix(raw), hash: await hashSecret(raw),
  });
  const app = new Hono();
  app.use('*', bearerTokenMiddleware({ storage }));
  app.get('/me', (c) => c.json({ principal: c.get('principal') }));
  return { app, principalId, raw };
}

describe('bearerTokenMiddleware', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => { storage = await makeStorage(); });
  afterEach(async () => { await storage.close(); });

  it('accepts a valid token and sets principal', async () => {
    const { app, principalId, raw } = await makeAppWithToken(storage);
    const r = await app.request('/me', { headers: { Authorization: `Bearer ${raw}` } });
    expect(r.status).toBe(200);
    const body = await r.json() as { principal: { id: string } };
    expect(body.principal.id).toBe(principalId);
  });

  it('rejects missing token with 401', async () => {
    const { app } = await makeAppWithToken(storage);
    const r = await app.request('/me');
    expect(r.status).toBe(401);
    const body = await r.json() as { error: { code: string } };
    expect(body.error.code).toBe('missing_token');
  });

  it('rejects malformed token with 401', async () => {
    const { app } = await makeAppWithToken(storage);
    const r = await app.request('/me', { headers: { Authorization: 'Bearer garbage' } });
    expect(r.status).toBe(401);
    const body = await r.json() as { error: { code: string } };
    expect(body.error.code).toBe('invalid_token');
  });

  it('rejects unknown token (right format, no DB row) with 401', async () => {
    const { app } = await makeAppWithToken(storage);
    const ghost = generateToken('pat', 'live');
    const r = await app.request('/me', { headers: { Authorization: `Bearer ${ghost}` } });
    expect(r.status).toBe(401);
    const body = await r.json() as { error: { code: string } };
    expect(body.error.code).toBe('invalid_token');
  });

  it('rejects revoked token with 401 token_revoked', async () => {
    const { app, raw } = await makeAppWithToken(storage);
    const tok = await storage.tokens.findByPrefix(computePrefix(raw));
    await storage.tokens.revoke(tok!.id);
    const r = await app.request('/me', { headers: { Authorization: `Bearer ${raw}` } });
    expect(r.status).toBe(401);
    const body = await r.json() as { error: { code: string } };
    expect(body.error.code).toBe('token_revoked');
  });

  it('rejects expired token with 401 token_expired', async () => {
    const principalId = newId();
    await storage.principals.createServiceAccount({ id: principalId, displayName: 'x' });
    const raw = generateToken('sat', 'live');
    await storage.tokens.create({
      id: newId(), principalId, prefix: computePrefix(raw), hash: await hashSecret(raw),
      expiresAt: Date.now() - 1000,
    });
    const app = new Hono();
    app.use('*', bearerTokenMiddleware({ storage }));
    app.get('/me', (c) => c.json({ ok: true }));
    const r = await app.request('/me', { headers: { Authorization: `Bearer ${raw}` } });
    expect(r.status).toBe(401);
    const body = await r.json() as { error: { code: string } };
    expect(body.error.code).toBe('token_expired');
  });

  it('rejects disabled principal with 403', async () => {
    const { app, principalId, raw } = await makeAppWithToken(storage);
    await storage.principals.setDisabled(principalId, true);
    const r = await app.request('/me', { headers: { Authorization: `Bearer ${raw}` } });
    expect(r.status).toBe(403);
    const body = await r.json() as { error: { code: string } };
    expect(body.error.code).toBe('principal_disabled');
  });
});
