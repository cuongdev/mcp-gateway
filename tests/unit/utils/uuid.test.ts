import { describe, it, expect } from 'vitest';
import { newId, isValidUuidV7 } from '../../../src/utils/uuid.js';

describe('uuid', () => {
  it('newId returns a v7 UUID', () => {
    const id = newId();
    expect(isValidUuidV7(id)).toBe(true);
  });

  it('newIds are sortable by creation order', async () => {
    const a = newId();
    await new Promise((r) => setTimeout(r, 5));
    const b = newId();
    expect(a < b).toBe(true);
  });

  it('rejects non-v7 ids', () => {
    expect(isValidUuidV7('not-a-uuid')).toBe(false);
    expect(isValidUuidV7('550e8400-e29b-41d4-a716-446655440000')).toBe(false); // v4
  });
});
