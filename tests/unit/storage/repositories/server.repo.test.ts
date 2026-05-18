import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../../src/storage/sqlite.adapter.js';

describe('ServerRepo', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => { storage = await makeStorage(); });
  afterEach(async () => { await storage.close(); });

  it('upserts a server and lists it', async () => {
    await storage.servers.upsert({
      name: 'db',
      transportType: 'streamable-http',
      transportConfig: { url: 'http://localhost:8002/mcp' },
      autoDiscover: true,
    });
    const list = await storage.servers.list();
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('db');
    expect(list[0].enabled).toBe(true);
    expect(list[0].transportConfig.url).toBe('http://localhost:8002/mcp');
  });

  it('findByName returns the server', async () => {
    await storage.servers.upsert({
      name: 'fs',
      transportType: 'stdio',
      transportConfig: { command: 'node', args: ['./fs.js'] },
    });
    const found = await storage.servers.findByName('fs');
    expect(found?.transportType).toBe('stdio');
  });

  it('upsert updates existing server', async () => {
    await storage.servers.upsert({
      name: 'db', transportType: 'streamable-http',
      transportConfig: { url: 'http://old' },
    });
    await storage.servers.upsert({
      name: 'db', transportType: 'streamable-http',
      transportConfig: { url: 'http://new' },
    });
    const list = await storage.servers.list();
    expect(list.length).toBe(1);
    expect(list[0].transportConfig.url).toBe('http://new');
  });

  it('setEnabled toggles the flag', async () => {
    await storage.servers.upsert({
      name: 'x', transportType: 'streamable-http', transportConfig: { url: 'u' },
    });
    await storage.servers.setEnabled('x', false);
    const found = await storage.servers.findByName('x');
    expect(found?.enabled).toBe(false);
  });

  it('deleteByName removes the row', async () => {
    await storage.servers.upsert({
      name: 'x', transportType: 'streamable-http', transportConfig: { url: 'u' },
    });
    await storage.servers.deleteByName('x');
    expect(await storage.servers.findByName('x')).toBeNull();
  });
});
