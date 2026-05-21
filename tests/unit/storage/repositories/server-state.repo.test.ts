import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../../src/storage/sqlite.adapter.js';

describe('ServerStateRepo', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => { storage = await makeStorage(); });
  afterEach(async () => { await storage.close(); });

  it('upsert + get round-trips', async () => {
    await storage.serverStates.upsert({
      serverName: 's1',
      state: 'healthy',
      consecutiveErrors: 0,
      rollingWindow: [{ ts: 1000, success: true, latencyMs: 5 }],
    });
    const row = await storage.serverStates.get('s1');
    expect(row).not.toBeNull();
    expect(row!.state).toBe('healthy');
    expect(row!.rollingWindow).toHaveLength(1);
    expect(row!.rollingWindow[0].success).toBe(true);
  });

  it('upsert updates existing row', async () => {
    await storage.serverStates.upsert({ serverName: 's1', state: 'healthy' });
    await storage.serverStates.upsert({
      serverName: 's1', state: 'circuit_open', openedAt: 12345, reopenCount: 1,
      lastTransitionReason: 'consecutive_errors',
    });
    const row = await storage.serverStates.get('s1');
    expect(row!.state).toBe('circuit_open');
    expect(row!.openedAt).toBe(12345);
    expect(row!.reopenCount).toBe(1);
    expect(row!.lastTransitionReason).toBe('consecutive_errors');
  });

  it('list returns all rows', async () => {
    await storage.serverStates.upsert({ serverName: 's1', state: 'healthy' });
    await storage.serverStates.upsert({ serverName: 's2', state: 'degraded' });
    const rows = await storage.serverStates.list();
    expect(rows).toHaveLength(2);
  });

  it('delete removes row', async () => {
    await storage.serverStates.upsert({ serverName: 's1', state: 'healthy' });
    await storage.serverStates.delete('s1');
    expect(await storage.serverStates.get('s1')).toBeNull();
  });

  it('config_json round-trips', async () => {
    await storage.serverStates.upsert({
      serverName: 's1', state: 'healthy',
      config: { errorRateThreshold: 0.7, cooldownMs: 5000 },
    });
    const row = await storage.serverStates.get('s1');
    expect(row!.config).toEqual({ errorRateThreshold: 0.7, cooldownMs: 5000 });
  });
});
