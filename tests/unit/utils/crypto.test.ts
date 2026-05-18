import { describe, it, expect } from 'vitest';
import { hashSecret, verifySecret } from '../../../src/utils/crypto.js';

describe('crypto', () => {
  it('hashSecret returns argon2id hash starting with $argon2id$', async () => {
    const hash = await hashSecret('hello');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('verifySecret returns true for correct secret', async () => {
    const hash = await hashSecret('correct-horse-battery-staple');
    expect(await verifySecret('correct-horse-battery-staple', hash)).toBe(true);
  });

  it('verifySecret returns false for wrong secret', async () => {
    const hash = await hashSecret('a');
    expect(await verifySecret('b', hash)).toBe(false);
  });

  it('hashes are unique for same input (random salt)', async () => {
    const a = await hashSecret('same');
    const b = await hashSecret('same');
    expect(a).not.toBe(b);
  });
});
