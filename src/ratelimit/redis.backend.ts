import { Redis } from 'ioredis';
import type { RateLimitBackend, RateLimitDecision } from './index.js';

export class RedisRateLimitBackend implements RateLimitBackend {
  private readonly client: Redis;

  constructor(url: string) {
    this.client = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: false });
  }

  async check(key: string, count: number, windowSec: number): Promise<RateLimitDecision> {
    const now = Date.now();
    const windowMs = windowSec * 1000;
    const windowStart = now - windowMs;
    const member = `${now}-${Math.random().toString(36).slice(2, 8)}`;
    const pipeline = this.client.multi();
    pipeline.zremrangebyscore(key, '-inf', windowStart);
    pipeline.zcard(key);
    pipeline.zadd(key, now, member);
    pipeline.pexpire(key, windowMs + 1000);
    const results = await pipeline.exec();
    if (!results) throw new Error('Redis pipeline returned null');
    const current = Number((results[1]?.[1] as number | null) ?? 0) + 1;
    return {
      allowed: current <= count,
      remaining: Math.max(0, count - current),
      resetAtMs: now + windowMs,
      rule: null,
    };
  }

  async shutdown(): Promise<void> {
    await this.client.quit();
  }
}
