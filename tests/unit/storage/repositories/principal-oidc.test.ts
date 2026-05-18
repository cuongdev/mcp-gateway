import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../../src/storage/sqlite.adapter.js';

describe('PrincipalRepo OIDC lookup', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => { storage = await makeStorage(); });
  afterEach(async () => { await storage.close(); });

  it('findByOidc returns null when no user matches', async () => {
    const p = await storage.principals.findByOidc('sub-1', 'google');
    expect(p).toBeNull();
  });

  it('upsertOidcUser creates a new User principal on first sight', async () => {
    const p = await storage.principals.upsertOidcUser({
      oidcSubject: 'sub-1', oidcProviderId: 'google',
      email: 'a@example.com', displayName: 'Alice',
    });
    expect(p.type).toBe('user');
    expect(p.email).toBe('a@example.com');
    expect(p.oidcSubject).toBe('sub-1');
    expect(p.oidcProviderId).toBe('google');
  });

  it('upsertOidcUser returns the existing principal on second call', async () => {
    const a = await storage.principals.upsertOidcUser({
      oidcSubject: 'sub-1', oidcProviderId: 'google',
      email: 'a@example.com', displayName: 'Alice',
    });
    const b = await storage.principals.upsertOidcUser({
      oidcSubject: 'sub-1', oidcProviderId: 'google',
      email: 'alice@example.com', displayName: 'Alice Updated',
    });
    expect(b.id).toBe(a.id);
    expect(b.email).toBe('alice@example.com');
    expect(b.displayName).toBe('Alice Updated');
  });

  it('findByOidc returns the principal after upsert', async () => {
    await storage.principals.upsertOidcUser({
      oidcSubject: 'sub-2', oidcProviderId: 'okta',
      email: 'b@example.com', displayName: 'Bob',
    });
    const p = await storage.principals.findByOidc('sub-2', 'okta');
    expect(p?.email).toBe('b@example.com');
  });

  it('same subject under different provider creates separate principal', async () => {
    const a = await storage.principals.upsertOidcUser({
      oidcSubject: 'sub-x', oidcProviderId: 'google',
      email: 'x@g.com', displayName: 'X',
    });
    const b = await storage.principals.upsertOidcUser({
      oidcSubject: 'sub-x', oidcProviderId: 'okta',
      email: 'x@o.com', displayName: 'X',
    });
    expect(b.id).not.toBe(a.id);
  });
});
