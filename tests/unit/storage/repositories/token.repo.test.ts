import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../../src/storage/sqlite.adapter.js';

describe('TokenRepo', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => {
    storage = await makeStorage();
    await storage.principals.createServiceAccount({ id: 'prn_1', displayName: 'admin' });
  });
  afterEach(async () => { await storage.close(); });

  it('creates a token and finds it by prefix', async () => {
    const created = await storage.tokens.create({
      id: 'tok_1', principalId: 'prn_1', prefix: 'mcp_sat_live_ABCDEFGH',
      hash: '$argon2id$v=19$...', name: 'first',
    });
    expect(created.id).toBe('tok_1');
    const found = await storage.tokens.findByPrefix('mcp_sat_live_ABCDEFGH');
    expect(found?.id).toBe('tok_1');
    expect(found?.principalId).toBe('prn_1');
  });

  it('findByPrefix returns null for unknown prefix', async () => {
    const found = await storage.tokens.findByPrefix('mcp_xxx_live_NOPE');
    expect(found).toBeNull();
  });

  it('updateLastUsed sets timestamp', async () => {
    await storage.tokens.create({
      id: 'tok_1', principalId: 'prn_1', prefix: 'mcp_sat_live_AAA',
      hash: 'h',
    });
    const ts = Date.now();
    await storage.tokens.updateLastUsed('tok_1', ts);
    const found = await storage.tokens.findByPrefix('mcp_sat_live_AAA');
    expect(found?.lastUsedAt).toBe(ts);
  });

  it('revoke sets revoked_at', async () => {
    await storage.tokens.create({
      id: 'tok_1', principalId: 'prn_1', prefix: 'mcp_sat_live_AAA',
      hash: 'h',
    });
    await storage.tokens.revoke('tok_1');
    const found = await storage.tokens.findByPrefix('mcp_sat_live_AAA');
    expect(found?.revokedAt).toBeGreaterThan(0);
  });

  it('lists tokens for a principal (prefix only, no hash)', async () => {
    await storage.tokens.create({ id: 'a', principalId: 'prn_1', prefix: 'p1', hash: 'h' });
    await storage.tokens.create({ id: 'b', principalId: 'prn_1', prefix: 'p2', hash: 'h' });
    const list = await storage.tokens.listForPrincipal('prn_1');
    expect(list.length).toBe(2);
    expect(list[0].hash).toBeUndefined();
  });

  it('cascade deletes tokens when principal removed', async () => {
    await storage.tokens.create({ id: 'a', principalId: 'prn_1', prefix: 'p1', hash: 'h' });
    await storage.transaction(async (tx) => {
      await tx.execute('DELETE FROM principals WHERE id = ?', ['prn_1']);
    });
    const found = await storage.tokens.findByPrefix('p1');
    expect(found).toBeNull();
  });
});
