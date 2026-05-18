import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../src/storage/sqlite.adapter.js';
import { jwtVerify } from 'jose';
import { signSessionCookie } from '../../src/middleware/auth/session-cookie.middleware.js';

const SECRET = new TextEncoder().encode('test-secret-for-session-cookies-must-be-32-chars-long');

describe('OIDC callback → unified cookie', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => { storage = await makeStorage(); });
  afterEach(async () => { await storage.close(); });

  it('signed session cookie carries pid (principal id) — not UserContext', async () => {
    const p = await storage.principals.upsertOidcUser({
      oidcSubject: 'sub-1', oidcProviderId: 'google',
      email: 'a@b.com', displayName: 'A',
    });
    const cookie = await signSessionCookie({ principalId: p.id }, SECRET);
    const { payload } = await jwtVerify(cookie, SECRET, { algorithms: ['HS256'] });
    expect(payload.pid).toBe(p.id);
    expect(payload.sub).toBeUndefined();
    expect(payload.roles).toBeUndefined();
    expect(payload.email).toBeUndefined();
  });

  it('signing a cookie for a principal that does not exist still succeeds (lookup happens on read)', async () => {
    const cookie = await signSessionCookie({ principalId: 'prn_does_not_exist' }, SECRET);
    const { payload } = await jwtVerify(cookie, SECRET, { algorithms: ['HS256'] });
    expect(payload.pid).toBe('prn_does_not_exist');
  });
});
