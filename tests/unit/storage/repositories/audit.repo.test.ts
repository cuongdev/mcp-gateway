import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../../src/storage/sqlite.adapter.js';

describe('AuditRepo', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => { storage = await makeStorage(); });
  afterEach(async () => { await storage.close(); });

  it('writes an entry and queries by principal', async () => {
    await storage.audit.write({
      id: 'a1', principalId: 'p', principalType: 'user',
      action: 'tool.call', resource: 'db__query', result: 'success', durationMs: 12,
    });
    const list = await storage.audit.listForPrincipal('p');
    expect(list.length).toBe(1);
    expect(list[0].action).toBe('tool.call');
  });

  it('writes entries with no principal (anonymous)', async () => {
    await storage.audit.write({
      id: 'a2', action: 'server.health', result: 'error', metadata: { reason: 'timeout' },
    });
    const r = await storage.transaction(async (tx) => tx.query('SELECT * FROM audit_logs'));
    expect(r.length).toBe(1);
  });

  it('listByAction filters by action', async () => {
    await storage.audit.write({ id: 'a1', action: 'tool.call', result: 'success' });
    await storage.audit.write({ id: 'a2', action: 'server.register', result: 'success' });
    const list = await storage.audit.listByAction('tool.call');
    expect(list.length).toBe(1);
    expect(list[0].id).toBe('a1');
  });

  it('metadata is stored as JSON', async () => {
    await storage.audit.write({
      id: 'a1', action: 'auth.failure', result: 'denied',
      metadata: { ip: '1.2.3.4', reason: 'bad_token' },
    });
    const all = await storage.transaction(async (tx) => tx.query<{ metadata: string }>('SELECT metadata FROM audit_logs'));
    expect(JSON.parse(all[0].metadata)).toEqual({ ip: '1.2.3.4', reason: 'bad_token' });
  });
});
