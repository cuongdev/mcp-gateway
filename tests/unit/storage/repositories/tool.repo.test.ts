import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../../src/storage/sqlite.adapter.js';

describe('ToolRepo', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => {
    storage = await makeStorage();
    await storage.servers.upsert({
      name: 'db', transportType: 'streamable-http', transportConfig: { url: 'u' },
    });
  });
  afterEach(async () => { await storage.close(); });

  it('replaces server tools (upsert semantics for a server)', async () => {
    await storage.tools.replaceServerTools('db', [
      { originalName: 'query', description: 'q', inputSchema: { type: 'object' } },
      { originalName: 'get_report', description: 'r', inputSchema: { type: 'object' } },
    ]);
    const list = await storage.tools.list();
    expect(list.length).toBe(2);
    expect(list.map((t) => t.canonicalName).sort()).toEqual(['db__get_report', 'db__query']);
  });

  it('second replaceServerTools wipes prior tools for that server', async () => {
    await storage.tools.replaceServerTools('db', [
      { originalName: 'a', description: '', inputSchema: {} },
    ]);
    await storage.tools.replaceServerTools('db', [
      { originalName: 'b', description: '', inputSchema: {} },
    ]);
    const list = await storage.tools.list();
    expect(list.map((t) => t.canonicalName)).toEqual(['db__b']);
  });

  it('findByCanonicalName returns the tool', async () => {
    await storage.tools.replaceServerTools('db', [
      { originalName: 'query', description: 'q', inputSchema: { type: 'object' } },
    ]);
    const found = await storage.tools.findByCanonicalName('db__query');
    expect(found?.serverName).toBe('db');
    expect(found?.originalName).toBe('query');
  });

  it('setEnabled toggles the flag', async () => {
    await storage.tools.replaceServerTools('db', [
      { originalName: 'q', description: '', inputSchema: {} },
    ]);
    await storage.tools.setEnabled('db__q', false);
    const found = await storage.tools.findByCanonicalName('db__q');
    expect(found?.enabled).toBe(false);
  });

  it('listForServer filters by server name', async () => {
    await storage.servers.upsert({
      name: 'fs', transportType: 'stdio', transportConfig: { command: 'n' },
    });
    await storage.tools.replaceServerTools('db', [
      { originalName: 'a', description: '', inputSchema: {} },
    ]);
    await storage.tools.replaceServerTools('fs', [
      { originalName: 'b', description: '', inputSchema: {} },
    ]);
    const dbTools = await storage.tools.listForServer('db');
    expect(dbTools.length).toBe(1);
    expect(dbTools[0].canonicalName).toBe('db__a');
  });
});
