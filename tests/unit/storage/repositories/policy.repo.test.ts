import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../../src/storage/sqlite.adapter.js';

describe('PolicyRepo', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => { storage = await makeStorage(); });
  afterEach(async () => { await storage.close(); });

  it('appends a policy and lists it', async () => {
    await storage.policies.append({ ptype: 'p', values: ['role:admin', '*', '*'] });
    const all = await storage.policies.list();
    expect(all.length).toBe(1);
    expect(all[0].ptype).toBe('p');
    expect(all[0].values).toEqual(['role:admin', '*', '*']);
  });

  it('replaceAll wipes prior rows', async () => {
    await storage.policies.append({ ptype: 'p', values: ['a', 'b', 'c'] });
    await storage.policies.replaceAll([
      { ptype: 'p', values: ['x', 'y', 'z'] },
      { ptype: 'g', values: ['u', 'r'] },
    ]);
    const all = await storage.policies.list();
    expect(all.length).toBe(2);
    expect(all.map((p) => p.ptype).sort()).toEqual(['g', 'p']);
  });

  it('list returns empty array when no policies', async () => {
    expect(await storage.policies.list()).toEqual([]);
  });
});
