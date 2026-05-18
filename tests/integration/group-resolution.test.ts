import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../src/storage/sqlite.adapter.js';
import { ToolRegistry } from '../../src/registry/tool.registry.js';
import { ToolGroupManager } from '../../src/registry/tool.groups.js';

describe('ToolGroupManager.resolveTools — whitelist + includes - excludes', () => {
  let storage: SqliteAdapter;
  let registry: ToolRegistry;

  beforeEach(async () => {
    storage = await makeStorage();
    await storage.servers.upsert({
      name: 'db', transportType: 'streamable-http', transportConfig: { url: 'u' },
    });
    await storage.servers.upsert({
      name: 'fs', transportType: 'stdio', transportConfig: { command: 'n' },
    });
    registry = new ToolRegistry(storage);
    await registry.registerServerTools('db', [
      { name: 'query', description: '', inputSchema: {} },
      { name: 'delete', description: '', inputSchema: {} },
    ]);
    await registry.registerServerTools('fs', [
      { name: 'read', description: '', inputSchema: {} },
      { name: 'write', description: '', inputSchema: {} },
    ]);
  });
  afterEach(async () => { await storage.close(); });

  it('whitelist-only (legacy P0 behavior)', async () => {
    const gm = new ToolGroupManager(storage, registry);
    await gm.create('g', ['db__query'], { description: '', allowedRoles: [] });
    expect(gm.resolveTools('g').sort()).toEqual(['db__query']);
  });

  it('included_servers expands to all server tools', async () => {
    const gm = new ToolGroupManager(storage, registry);
    await gm.create('g', [], { description: '', allowedRoles: [] });
    await storage.groups.setIncludedServers('g', ['db']);
    await gm.load();
    expect(gm.resolveTools('g').sort()).toEqual(['db__delete', 'db__query']);
  });

  it('included_servers + excluded_tools', async () => {
    const gm = new ToolGroupManager(storage, registry);
    await gm.create('g', [], { description: '', allowedRoles: [] });
    await storage.groups.setIncludedServers('g', ['db']);
    await storage.groups.setExcludedTools('g', ['db__delete']);
    await gm.load();
    expect(gm.resolveTools('g').sort()).toEqual(['db__query']);
  });

  it('whitelist + includes union, minus excludes', async () => {
    const gm = new ToolGroupManager(storage, registry);
    await gm.create('g', ['fs__write'], { description: '', allowedRoles: [] });
    await storage.groups.setIncludedServers('g', ['db']);
    await storage.groups.setExcludedTools('g', ['db__delete']);
    await gm.load();
    expect(gm.resolveTools('g').sort()).toEqual(['db__query', 'fs__write']);
  });

  it('filters out disabled tools', async () => {
    const gm = new ToolGroupManager(storage, registry);
    await gm.create('g', [], { description: '', allowedRoles: [] });
    await storage.groups.setIncludedServers('g', ['db']);
    await gm.load();
    await registry.setEnabled('db__delete', false);
    expect(gm.resolveTools('g').sort()).toEqual(['db__query']);
  });
});
