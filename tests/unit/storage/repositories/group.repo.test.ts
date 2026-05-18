import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../../src/storage/sqlite.adapter.js';

describe('GroupRepo', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => {
    storage = await makeStorage();
    await storage.servers.upsert({
      name: 'db', transportType: 'streamable-http', transportConfig: { url: 'u' },
    });
    await storage.tools.replaceServerTools('db', [
      { originalName: 'a', description: '', inputSchema: {} },
      { originalName: 'b', description: '', inputSchema: {} },
    ]);
  });
  afterEach(async () => { await storage.close(); });

  it('creates a group and lists its tools', async () => {
    await storage.groups.create({
      name: 'g1', description: 'd', allowedRoles: ['admin'], tools: ['db__a'],
    });
    const g = await storage.groups.findByName('g1');
    expect(g?.tools).toEqual(['db__a']);
    expect(g?.allowedRoles).toEqual(['admin']);
  });

  it('updates group tools (full replacement)', async () => {
    await storage.groups.create({
      name: 'g1', description: '', allowedRoles: [], tools: ['db__a'],
    });
    await storage.groups.setTools('g1', ['db__b']);
    const g = await storage.groups.findByName('g1');
    expect(g?.tools).toEqual(['db__b']);
  });

  it('lists all groups', async () => {
    await storage.groups.create({ name: 'g1', description: '', allowedRoles: [], tools: [] });
    await storage.groups.create({ name: 'g2', description: '', allowedRoles: [], tools: [] });
    const list = await storage.groups.list();
    expect(list.map((g) => g.name).sort()).toEqual(['g1', 'g2']);
  });

  it('deletes a group', async () => {
    await storage.groups.create({ name: 'g1', description: '', allowedRoles: [], tools: ['db__a'] });
    await storage.groups.deleteByName('g1');
    expect(await storage.groups.findByName('g1')).toBeNull();
  });
});

describe('GroupRepo includes/excludes', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => {
    storage = await makeStorage();
    await storage.servers.upsert({
      name: 'db', transportType: 'streamable-http', transportConfig: { url: 'u' },
    });
    await storage.servers.upsert({
      name: 'fs', transportType: 'stdio', transportConfig: { command: 'n' },
    });
  });
  afterEach(async () => { await storage.close(); });

  it('setIncludedServers stores and findByName returns them', async () => {
    await storage.groups.create({ name: 'g', description: '', allowedRoles: [], tools: [] });
    await storage.groups.setIncludedServers('g', ['db', 'fs']);
    const g = await storage.groups.findByName('g');
    expect(g?.includedServers?.sort()).toEqual(['db', 'fs']);
  });

  it('setExcludedTools stores and findByName returns them', async () => {
    await storage.groups.create({ name: 'g', description: '', allowedRoles: [], tools: [] });
    await storage.groups.setExcludedTools('g', ['db__delete', 'fs__write']);
    const g = await storage.groups.findByName('g');
    expect(g?.excludedTools?.sort()).toEqual(['db__delete', 'fs__write']);
  });

  it('cascade clears group_included_servers when group deleted', async () => {
    await storage.groups.create({ name: 'g', description: '', allowedRoles: [], tools: [] });
    await storage.groups.setIncludedServers('g', ['db']);
    await storage.groups.deleteByName('g');
    const r = await storage.transaction(async (tx) => tx.query('SELECT * FROM group_included_servers'));
    expect(r.length).toBe(0);
  });
});
