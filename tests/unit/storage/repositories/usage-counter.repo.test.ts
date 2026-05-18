import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../../src/storage/sqlite.adapter.js';

describe('UsageCounterRepo', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => { storage = await makeStorage(); });
  afterEach(async () => { await storage.close(); });

  it('increment creates new row at count=1 then increments', async () => {
    expect(await storage.usage.increment('prn_a', 'day:2026-05-19', 1)).toBe(1);
    expect(await storage.usage.increment('prn_a', 'day:2026-05-19', 1)).toBe(2);
    expect(await storage.usage.increment('prn_a', 'day:2026-05-19', 5)).toBe(7);
  });

  it('get returns 0 for missing row', async () => {
    expect(await storage.usage.get('prn_a', 'day:2026-05-19')).toBe(0);
  });

  it('get returns current count', async () => {
    await storage.usage.increment('prn_a', 'month:2026-05', 3);
    expect(await storage.usage.get('prn_a', 'month:2026-05')).toBe(3);
  });

  it('resetBefore deletes rows with scope < cutoff', async () => {
    await storage.usage.increment('prn_a', 'day:2026-05-18', 5);
    await storage.usage.increment('prn_a', 'day:2026-05-19', 7);
    await storage.usage.increment('prn_a', 'day:2026-05-20', 2);
    const deleted = await storage.usage.resetBefore('day:2026-05-19');
    expect(deleted).toBe(1);
    expect(await storage.usage.get('prn_a', 'day:2026-05-18')).toBe(0);
    expect(await storage.usage.get('prn_a', 'day:2026-05-19')).toBe(7);
  });

  it('listForPrincipal returns scopes for that principal only', async () => {
    await storage.usage.increment('prn_a', 'day:2026-05-19', 5);
    await storage.usage.increment('prn_b', 'day:2026-05-19', 3);
    const rows = await storage.usage.listForPrincipal('prn_a');
    expect(rows.length).toBe(1);
    expect(rows[0].count).toBe(5);
  });
});
