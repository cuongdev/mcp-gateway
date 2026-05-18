import { describe, it, expect } from 'vitest';
import { cacheKey } from '../../../src/cache/key.js';

describe('cacheKey', () => {
  it('same args produce same key regardless of property order', () => {
    expect(cacheKey('db__q', { a: 1, b: 2 })).toBe(cacheKey('db__q', { b: 2, a: 1 }));
  });
  it('different args produce different keys', () => {
    expect(cacheKey('t', { a: 1 })).not.toBe(cacheKey('t', { a: 2 }));
  });
  it('principalId scoping changes the key', () => {
    expect(cacheKey('t', { x: 1 })).not.toBe(cacheKey('t', { x: 1 }, 'prn_u'));
  });
  it('handles arrays + nested objects', () => {
    const a = cacheKey('t', { xs: [{ a: 1 }, { b: 2 }] });
    const b = cacheKey('t', { xs: [{ a: 1 }, { b: 2 }] });
    expect(a).toBe(b);
  });
});
