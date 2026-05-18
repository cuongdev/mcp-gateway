import type { RateLimitBackend, RateLimitDecision } from './index.js';

interface Bucket {
  count: number;
  resetAtMs: number;
}

export class MemoryRateLimitBackend implements RateLimitBackend {
  private readonly buckets = new Map<string, Bucket>();

  async check(key: string, count: number, windowSec: number): Promise<RateLimitDecision> {
    const now = Date.now();
    let b = this.buckets.get(key);
    if (!b || b.resetAtMs <= now) {
      b = { count: 0, resetAtMs: now + windowSec * 1000 };
      this.buckets.set(key, b);
    }
    b.count++;
    return {
      allowed: b.count <= count,
      remaining: Math.max(0, count - b.count),
      resetAtMs: b.resetAtMs,
      rule: null,
    };
  }

  async shutdown(): Promise<void> {
    this.buckets.clear();
  }
}
