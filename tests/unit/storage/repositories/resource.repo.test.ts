import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../../src/storage/sqlite.adapter.js';

describe('ResourceRepo', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => { storage = await makeStorage(); });
  afterEach(async () => { await storage.close(); });

  it('replaceServerResources inserts new rows', async () => {
    await storage.resources.replaceServerResources('srv1', [
      { uri: 'file:///a.txt', name: 'A', description: 'a', mimeType: 'text/plain' },
      { uri: 'file:///b.txt', name: 'B' },
    ]);
    const rows = await storage.resources.listByServer('srv1');
    expect(rows).toHaveLength(2);
    expect(rows[0].serverName).toBe('srv1');
    expect(rows[0].canonicalName).toMatch(/^srv1__[a-f0-9]{16}$/);
  });

  it('replaceServerResources deletes prior entries for that server', async () => {
    await storage.resources.replaceServerResources('srv1', [{ uri: 'file:///a' }]);
    await storage.resources.replaceServerResources('srv1', [{ uri: 'file:///b' }]);
    const rows = await storage.resources.listByServer('srv1');
    expect(rows).toHaveLength(1);
    expect(rows[0].uri).toBe('file:///b');
  });

  it('list returns all resources across servers', async () => {
    await storage.resources.replaceServerResources('s1', [{ uri: 'a' }]);
    await storage.resources.replaceServerResources('s2', [{ uri: 'b' }]);
    const rows = await storage.resources.list();
    expect(rows).toHaveLength(2);
  });

  it('setEnabled flips the flag', async () => {
    await storage.resources.replaceServerResources('s1', [{ uri: 'a' }]);
    const [row] = await storage.resources.listByServer('s1');
    await storage.resources.setEnabled(row.canonicalName, false);
    const fetched = await storage.resources.findByCanonicalName(row.canonicalName);
    expect(fetched?.enabled).toBe(false);
  });

  it('setSensitive flips the flag', async () => {
    await storage.resources.replaceServerResources('s1', [{ uri: 'a' }]);
    const [row] = await storage.resources.listByServer('s1');
    await storage.resources.setSensitive(row.canonicalName, true);
    const fetched = await storage.resources.findByCanonicalName(row.canonicalName);
    expect(fetched?.sensitive).toBe(true);
  });

  it('replaceServerTemplates round-trips', async () => {
    await storage.resources.replaceServerTemplates('s1', [
      { uriTemplate: 'file:///{path}', name: 'tpl', mimeType: 'text/plain' },
    ]);
    const rows = await storage.resources.listTemplatesByServer('s1');
    expect(rows).toHaveLength(1);
    expect(rows[0].uriTemplate).toBe('file:///{path}');
  });
});
