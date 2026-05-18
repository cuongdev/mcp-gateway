import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../src/storage/sqlite.adapter.js';
import { PromptRegistry } from '../../src/registry/prompt.registry.js';

describe('PromptRegistry persistence', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => {
    storage = await makeStorage();
    await storage.servers.upsert({
      name: 'db', transportType: 'streamable-http', transportConfig: { url: 'u' },
    });
  });
  afterEach(async () => { await storage.close(); });

  it('registered prompts survive a fresh registry backed by same storage', async () => {
    const reg1 = new PromptRegistry(storage);
    await reg1.registerServerPrompts('db', [
      { name: 'report', description: 'r', argumentsSchema: { type: 'object' } },
    ]);

    const reg2 = new PromptRegistry(storage);
    await reg2.load();
    expect(reg2.list().map((p) => p.canonicalName)).toEqual(['db__report']);
  });

  it('list filters by enabled flag', async () => {
    const reg = new PromptRegistry(storage);
    await reg.registerServerPrompts('db', [
      { name: 'a', description: '', argumentsSchema: {} },
      { name: 'b', description: '', argumentsSchema: {} },
    ]);
    await reg.setEnabled('db__a', false);
    expect(reg.list().map((p) => p.canonicalName)).toEqual(['db__b']);
    expect(reg.listAll().map((p) => p.canonicalName).sort()).toEqual(['db__a', 'db__b']);
  });

  it('get returns full record', async () => {
    const reg = new PromptRegistry(storage);
    await reg.registerServerPrompts('db', [
      { name: 'r', description: 'd', argumentsSchema: { type: 'object' } },
    ]);
    const p = reg.get('db__r');
    expect(p?.serverName).toBe('db');
    expect(p?.originalName).toBe('r');
  });
});
