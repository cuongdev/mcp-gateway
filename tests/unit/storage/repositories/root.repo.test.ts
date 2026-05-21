import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../../src/storage/sqlite.adapter.js';

describe('RootRepo', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => { storage = await makeStorage(); });
  afterEach(async () => { await storage.close(); });

  it('replaceServerRoots inserts', async () => {
    await storage.roots.replaceServerRoots('s1', [
      { uri: 'file:///workspace', name: 'workspace' },
    ]);
    const rows = await storage.roots.list();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('workspace');
    expect(rows[0].canonicalName).toMatch(/^s1__root_[a-f0-9]{16}$/);
  });

  it('listByServer filters', async () => {
    await storage.roots.replaceServerRoots('s1', [{ uri: 'a' }]);
    await storage.roots.replaceServerRoots('s2', [{ uri: 'b' }]);
    const rows = await storage.roots.listByServer('s1');
    expect(rows).toHaveLength(1);
    expect(rows[0].uri).toBe('a');
  });

  it('replace deletes prior entries for that server', async () => {
    await storage.roots.replaceServerRoots('s1', [{ uri: 'a' }, { uri: 'b' }]);
    await storage.roots.replaceServerRoots('s1', [{ uri: 'c' }]);
    const rows = await storage.roots.listByServer('s1');
    expect(rows).toHaveLength(1);
    expect(rows[0].uri).toBe('c');
  });
});
