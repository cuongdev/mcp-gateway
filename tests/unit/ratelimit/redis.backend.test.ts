import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('ioredis', async () => {
  const Mock = await import('ioredis-mock');
  // Use Mock.default if it exists, otherwise Mock itself
  const cls = (Mock as any).default ?? Mock;
  return { Redis: cls, default: cls };
});

const { RedisRateLimitBackend } = await import('../../../src/ratelimit/redis.backend.js');

describe('RedisRateLimitBackend (ioredis-mock)', () => {
  let b: InstanceType<typeof RedisRateLimitBackend>;
  beforeEach(() => { b = new RedisRateLimitBackend('redis://mock:6379'); });
  afterEach(async () => { await b.shutdown(); });

  it('allows N within window, denies N+1', async () => {
    for (let i = 0; i < 5; i++) {
      const d = await b.check('k1', 5, 60);
      expect(d.allowed).toBe(true);
    }
    const denied = await b.check('k1', 5, 60);
    expect(denied.allowed).toBe(false);
  });
});
