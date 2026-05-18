import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../src/storage/sqlite.adapter.js';
import { ToolRegistry } from '../../src/registry/tool.registry.js';
import { ToolGroupManager } from '../../src/registry/tool.groups.js';

describe('ToolGroupManager persistence', () => {
  let storage: SqliteAdapter;
  let registry: ToolRegistry;
  beforeEach(async () => {
    storage = await makeStorage();
    await storage.servers.upsert({
      name: 'db', transportType: 'streamable-http', transportConfig: { url: 'u' },
    });
    registry = new ToolRegistry(storage);
    await registry.registerServerTools('db', [
      { name: 'a', description: '', inputSchema: {} },
      { name: 'b', description: '', inputSchema: {} },
    ]);
  });
  afterEach(async () => { await storage.close(); });

  it('group created in instance A is visible to instance B with same storage', async () => {
    const gmA = new ToolGroupManager(storage, registry);
    await gmA.create('analyst', ['db__a'], { description: 'd', allowedRoles: ['admin'] });

    const gmB = new ToolGroupManager(storage, registry);
    await gmB.load();
    const g = gmB.get('analyst');
    expect(g?.tools).toEqual(['db__a']);
  });

  it('list returns all persisted groups', async () => {
    const gm = new ToolGroupManager(storage, registry);
    await gm.create('g1', ['db__a'], { description: '', allowedRoles: [] });
    await gm.create('g2', ['db__b'], { description: '', allowedRoles: [] });
    expect(gm.list().map((g) => g.name).sort()).toEqual(['g1', 'g2']);
  });
});
