import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { SignJWT } from 'jose';
import { makeStorage } from '../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../src/storage/sqlite.adapter.js';
import { sessionCookieMiddleware, signSessionCookie } from '../../../src/middleware/auth/session-cookie.middleware.js';

const SECRET = new TextEncoder().encode('test-secret-for-session-cookies-must-be-32-chars-long');

describe('sessionCookieMiddleware', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => { storage = await makeStorage(); });
  afterEach(async () => { await storage.close(); });

  it('accepts a valid signed cookie and sets principal', async () => {
    await storage.principals.createUser({
      id: 'prn_u', email: 'a@b.com', displayName: 'A',
    });
    const cookie = await signSessionCookie({ principalId: 'prn_u' }, SECRET);

    const app = new Hono();
    app.use('*', sessionCookieMiddleware({ storage, secret: SECRET, cookieName: 'mcp_session' }));
    app.get('/me', (c) => c.json({ p: c.get('principal') }));

    const r = await app.request('/me', { headers: { cookie: `mcp_session=${cookie}` } });
    expect(r.status).toBe(200);
    const body = await r.json() as { p: { id: string; type: string } };
    expect(body.p.id).toBe('prn_u');
    expect(body.p.type).toBe('user');
  });

  it('passes through when cookie is absent (lets bearer-token mw try)', async () => {
    const app = new Hono();
    app.use('*', sessionCookieMiddleware({ storage, secret: SECRET, cookieName: 'mcp_session' }));
    app.get('/me', (c) => c.json({ p: c.get('principal') ?? null }));
    const r = await app.request('/me');
    expect(r.status).toBe(200);
    const body = await r.json() as { p: unknown };
    expect(body.p).toBeNull();
  });

  it('passes through when cookie signature is invalid', async () => {
    const otherSecret = new TextEncoder().encode('different-secret-for-session-cookies-32-chars-min');
    const cookie = await new SignJWT({ principalId: 'prn_x' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(otherSecret);

    const app = new Hono();
    app.use('*', sessionCookieMiddleware({ storage, secret: SECRET, cookieName: 'mcp_session' }));
    app.get('/me', (c) => c.json({ p: c.get('principal') ?? null }));
    const r = await app.request('/me', { headers: { cookie: `mcp_session=${cookie}` } });
    expect(r.status).toBe(200);
    const body = await r.json() as { p: unknown };
    expect(body.p).toBeNull();
  });
});
