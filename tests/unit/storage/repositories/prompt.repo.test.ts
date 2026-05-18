import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../../src/storage/sqlite.adapter.js';

describe('PromptRepo', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => {
    storage = await makeStorage();
    await storage.servers.upsert({
      name: 'db', transportType: 'streamable-http', transportConfig: { url: 'u' },
    });
  });
  afterEach(async () => { await storage.close(); });

  it('replaces server prompts (upsert semantics)', async () => {
    await storage.prompts.replaceServerPrompts('db', [
      { originalName: 'report', description: 'r', argumentsSchema: { type: 'object' } },
      { originalName: 'summary', description: 's', argumentsSchema: { type: 'object' } },
    ]);
    const list = await storage.prompts.list();
    expect(list.length).toBe(2);
    expect(list.map((p) => p.canonicalName).sort()).toEqual(['db__report', 'db__summary']);
  });

  it('second replace wipes prior prompts for that server', async () => {
    await storage.prompts.replaceServerPrompts('db', [
      { originalName: 'a', description: '', argumentsSchema: {} },
    ]);
    await storage.prompts.replaceServerPrompts('db', [
      { originalName: 'b', description: '', argumentsSchema: {} },
    ]);
    const list = await storage.prompts.list();
    expect(list.map((p) => p.canonicalName)).toEqual(['db__b']);
  });

  it('findByCanonicalName returns the prompt', async () => {
    await storage.prompts.replaceServerPrompts('db', [
      { originalName: 'r', description: '', argumentsSchema: {} },
    ]);
    const found = await storage.prompts.findByCanonicalName('db__r');
    expect(found?.serverName).toBe('db');
  });

  it('setEnabled toggles the flag', async () => {
    await storage.prompts.replaceServerPrompts('db', [
      { originalName: 'p', description: '', argumentsSchema: {} },
    ]);
    await storage.prompts.setEnabled('db__p', false);
    const found = await storage.prompts.findByCanonicalName('db__p');
    expect(found?.enabled).toBe(false);
  });

  it('cascade deletes prompts when server removed', async () => {
    await storage.prompts.replaceServerPrompts('db', [
      { originalName: 'p', description: '', argumentsSchema: {} },
    ]);
    await storage.servers.deleteByName('db');
    expect(await storage.prompts.findByCanonicalName('db__p')).toBeNull();
  });
});
