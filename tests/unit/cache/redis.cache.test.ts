import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('ioredis', async () => {
  const Mock = await import('ioredis-mock');
  const cls = (Mock as any).default ?? Mock;
  return { Redis: cls, default: cls };
});

const { RedisToolCache } = await import('../../../src/cache/redis.cache.js');

describe('RedisToolCache (ioredis-mock)', () => {
  let c: InstanceType<typeof RedisToolCache>;
  beforeEach(() => { c = new RedisToolCache('redis://mock:6379'); });
  afterEach(async () => { await c.shutdown(); });

  it('set + get + invalidateTool', async () => {
    await c.set('k', { body: 'v', contentType: 'x' }, 60, { tool: 'db__q' });
    expect((await c.get('k'))?.body).toBe('v');
    expect(await c.invalidateTool('db__q')).toBe(1);
    expect(await c.get('k')).toBeNull();
  });
});
