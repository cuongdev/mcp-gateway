import { describe, it, expect } from 'vitest';
import { MemoryRateLimitBackend } from '../../../src/ratelimit/memory.backend.js';

describe('MemoryRateLimitBackend', () => {
  it('allows N requests within window then denies the N+1th', async () => {
    const b = new MemoryRateLimitBackend();
    for (let i = 0; i < 5; i++) {
      const d = await b.check('k1', 5, 60);
      expect(d.allowed).toBe(true);
    }
    const denied = await b.check('k1', 5, 60);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
  });

  it('window resets after expiry', async () => {
    const b = new MemoryRateLimitBackend();
    for (let i = 0; i < 5; i++) await b.check('k', 5, 0.1);   // 100ms window
    await new Promise((r) => setTimeout(r, 150));
    const d = await b.check('k', 5, 0.1);
    expect(d.allowed).toBe(true);
  });

  it('different keys are independent', async () => {
    const b = new MemoryRateLimitBackend();
    for (let i = 0; i < 3; i++) await b.check('a', 3, 60);
    const a4 = await b.check('a', 3, 60);
    const b1 = await b.check('b', 3, 60);
    expect(a4.allowed).toBe(false);
    expect(b1.allowed).toBe(true);
  });
});
