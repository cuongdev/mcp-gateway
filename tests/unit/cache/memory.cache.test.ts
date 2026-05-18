import { describe, it, expect } from 'vitest';
import { MemoryToolCache } from '../../../src/cache/memory.cache.js';

describe('MemoryToolCache', () => {
  it('set + get round-trip', async () => {
    const c = new MemoryToolCache();
    await c.set('k1', { body: '{"a":1}', contentType: 'application/json' }, 60, { tool: 't' });
    expect((await c.get('k1'))?.body).toBe('{"a":1}');
  });
  it('get returns null after TTL', async () => {
    const c = new MemoryToolCache();
    await c.set('k', { body: 'x', contentType: 'text/plain' }, 0.05, { tool: 't' });
    await new Promise((r) => setTimeout(r, 100));
    expect(await c.get('k')).toBeNull();
  });
  it('invalidateTool clears matching entries', async () => {
    const c = new MemoryToolCache();
    await c.set('a', { body: '1', contentType: 'x' }, 60, { tool: 'db__q' });
    await c.set('b', { body: '2', contentType: 'x' }, 60, { tool: 'db__q' });
    await c.set('c', { body: '3', contentType: 'x' }, 60, { tool: 'fs__r' });
    expect(await c.invalidateTool('db__q')).toBe(2);
    expect(await c.get('c')).not.toBeNull();
  });
  it('maxEntries evicts oldest', async () => {
    const c = new MemoryToolCache(2);
    await c.set('a', { body: '1', contentType: 'x' }, 60, { tool: 't' });
    await c.set('b', { body: '2', contentType: 'x' }, 60, { tool: 't' });
    await c.set('c', { body: '3', contentType: 'x' }, 60, { tool: 't' });
    expect(await c.get('a')).toBeNull();
    expect(await c.get('c')).not.toBeNull();
  });
});
