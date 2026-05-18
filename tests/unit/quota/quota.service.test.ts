import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../src/storage/sqlite.adapter.js';
import { QuotaService } from '../../../src/quota/index.js';

describe('QuotaService', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => { storage = await makeStorage(); });
  afterEach(async () => { await storage.close(); });

  it('allows up to daily limit then denies', async () => {
    const q = new QuotaService(storage, {
      enabled: true,
      default: { daily: 3, monthly: 100 },
      overrides: [],
    });
    for (let i = 0; i < 3; i++) {
      const d = await q.checkAndIncrement({ principalType: 'user', principalId: 'prn_u' });
      expect(d.allowed).toBe(true);
    }
    const denied = await q.checkAndIncrement({ principalType: 'user', principalId: 'prn_u' });
    expect(denied.allowed).toBe(false);
    expect(denied.period).toBe('daily');
  });

  it('principalId override beats default', async () => {
    const q = new QuotaService(storage, {
      enabled: true,
      default: { daily: 1 },
      overrides: [{ principalId: 'prn_vip', daily: 100 }],
    });
    for (let i = 0; i < 5; i++) {
      const d = await q.checkAndIncrement({ principalType: 'user', principalId: 'prn_vip' });
      expect(d.allowed).toBe(true);
    }
  });

  it('disabled quota always allows', async () => {
    const q = new QuotaService(storage, {
      enabled: false, default: { daily: 0 }, overrides: [],
    });
    for (let i = 0; i < 100; i++) {
      const d = await q.checkAndIncrement({ principalType: 'user', principalId: 'p' });
      expect(d.allowed).toBe(true);
    }
  });
});
