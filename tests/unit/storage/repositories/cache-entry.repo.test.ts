import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../../src/storage/sqlite.adapter.js';

describe('CacheEntryRepo', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => { storage = await makeStorage(); });
  afterEach(async () => { await storage.close(); });

  it('set+get round-trip', async () => {
    const exp = Date.now() + 60_000;
    await storage.cache.set('k1', { tool: 'db__q', value: '{"a":1}', expiresAt: exp });
    const got = await storage.cache.get('k1');
    expect(got?.value).toBe('{"a":1}');
    expect(got?.tool).toBe('db__q');
  });

  it('get returns null for expired entry', async () => {
    await storage.cache.set('k1', {
      tool: 't', value: 'v', expiresAt: Date.now() - 1000,
    });
    expect(await storage.cache.get('k1')).toBeNull();
  });

  it('deleteByTool removes only that tool entries', async () => {
    const exp = Date.now() + 60_000;
    await storage.cache.set('k_db_1', { tool: 'db__q', value: 'a', expiresAt: exp });
    await storage.cache.set('k_db_2', { tool: 'db__q', value: 'b', expiresAt: exp });
    await storage.cache.set('k_fs_1', { tool: 'fs__r', value: 'c', expiresAt: exp });
    const n = await storage.cache.deleteByTool('db__q');
    expect(n).toBe(2);
    expect(await storage.cache.get('k_fs_1')).not.toBeNull();
  });

  it('deleteByPrincipal removes entries for that principal', async () => {
    const exp = Date.now() + 60_000;
    await storage.cache.set('k1', { tool: 't', value: 'v', expiresAt: exp, principalId: 'prn_a' });
    await storage.cache.set('k2', { tool: 't', value: 'v', expiresAt: exp, principalId: 'prn_b' });
    expect(await storage.cache.deleteByPrincipal('prn_a')).toBe(1);
    expect(await storage.cache.get('k1')).toBeNull();
    expect(await storage.cache.get('k2')).not.toBeNull();
  });

  it('purgeExpired deletes entries past expiry', async () => {
    await storage.cache.set('old', { tool: 't', value: 'v', expiresAt: Date.now() - 1000 });
    await storage.cache.set('new', { tool: 't', value: 'v', expiresAt: Date.now() + 60_000 });
    const n = await storage.cache.purgeExpired();
    expect(n).toBe(1);
    expect(await storage.cache.get('new')).not.toBeNull();
  });
});
