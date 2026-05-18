import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../src/storage/sqlite.adapter.js';
import { ToolRegistry } from '../../src/registry/tool.registry.js';

describe('ToolRegistry persistence', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => {
    storage = await makeStorage();
    await storage.servers.upsert({
      name: 'db', transportType: 'streamable-http', transportConfig: { url: 'u' },
    });
  });
  afterEach(async () => { await storage.close(); });

  it('registered tools survive a fresh registry instance backed by same storage', async () => {
    const reg1 = new ToolRegistry(storage);
    await reg1.registerServerTools('db', [
      { name: 'query_data', description: 'q', inputSchema: { type: 'object' } },
    ]);

    const reg2 = new ToolRegistry(storage);
    await reg2.load();
    expect(reg2.list().map((t) => t.canonicalName)).toEqual(['db__query_data']);
  });

  it('setEnabled persists to DB', async () => {
    const reg = new ToolRegistry(storage);
    await reg.registerServerTools('db', [
      { name: 'q', description: '', inputSchema: {} },
    ]);
    await reg.setEnabled('db__q', false);
    const t = await storage.tools.findByCanonicalName('db__q');
    expect(t?.enabled).toBe(false);
  });
});
