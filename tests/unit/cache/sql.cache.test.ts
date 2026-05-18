import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../src/storage/sqlite.adapter.js';
import { SqlToolCache } from '../../../src/cache/sql.cache.js';

describe('SqlToolCache', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => { storage = await makeStorage(); });
  afterEach(async () => { await storage.close(); });

  it('round-trips via cache_entries table', async () => {
    const c = new SqlToolCache(storage);
    await c.set('k', { body: '{"r":1}', contentType: 'application/json' }, 60, { tool: 'db__q' });
    expect((await c.get('k'))?.body).toBe('{"r":1}');
  });
  it('invalidateTool removes matching entries', async () => {
    const c = new SqlToolCache(storage);
    await c.set('a', { body: 'x', contentType: 'x' }, 60, { tool: 'db__q' });
    await c.set('b', { body: 'y', contentType: 'x' }, 60, { tool: 'db__q' });
    expect(await c.invalidateTool('db__q')).toBe(2);
  });
});
