import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../../src/storage/sqlite.adapter.js';

describe('ApprovalRepo', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => {
    storage = await makeStorage();
    await storage.principals.createServiceAccount({ id: 'prn_caller', displayName: 'a' });
    await storage.principals.createServiceAccount({ id: 'prn_admin', displayName: 'b' });
  });
  afterEach(async () => { await storage.close(); });

  it('create starts in pending status', async () => {
    const a = await storage.approvals.create({
      id: 'app_1', principalId: 'prn_caller', tool: 'db__delete',
      argsJson: '{"x":1}', argsHash: 'h', ttlSec: 60,
    });
    expect(a.status).toBe('pending');
    expect(a.tsExpires).toBeGreaterThan(Date.now());
  });

  it('findById round-trips', async () => {
    await storage.approvals.create({
      id: 'app_1', principalId: 'prn_caller', tool: 'db__d', argsJson: '{}', argsHash: 'h', ttlSec: 60,
    });
    const a = await storage.approvals.findById('app_1');
    expect(a?.tool).toBe('db__d');
  });

  it('decide approve sets approver + status', async () => {
    await storage.approvals.create({
      id: 'app_1', principalId: 'prn_caller', tool: 't', argsJson: '{}', argsHash: 'h', ttlSec: 60,
    });
    const ok = await storage.approvals.decide('app_1', 'approved', 'prn_admin', 'looks good');
    expect(ok).toBe(true);
    const a = await storage.approvals.findById('app_1');
    expect(a?.status).toBe('approved');
    expect(a?.approverId).toBe('prn_admin');
    expect(a?.decisionReason).toBe('looks good');
  });

  it('decide is idempotent — second call returns false (concurrent loser)', async () => {
    await storage.approvals.create({ id: 'app_1', principalId: 'prn_caller', tool: 't', argsJson: '{}', argsHash: 'h', ttlSec: 60 });
    expect(await storage.approvals.decide('app_1', 'approved', 'prn_admin')).toBe(true);
    expect(await storage.approvals.decide('app_1', 'rejected', 'prn_admin')).toBe(false);
  });

  it('listPending returns only pending', async () => {
    await storage.approvals.create({ id: 'app_1', principalId: 'prn_caller', tool: 't', argsJson: '{}', argsHash: 'h', ttlSec: 60 });
    await storage.approvals.create({ id: 'app_2', principalId: 'prn_caller', tool: 't', argsJson: '{}', argsHash: 'h', ttlSec: 60 });
    await storage.approvals.decide('app_2', 'approved', 'prn_admin');
    const list = await storage.approvals.listPending();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe('app_1');
  });

  it('expirePending sets status=expired for entries past ts_expires', async () => {
    await storage.approvals.create({ id: 'app_1', principalId: 'prn_caller', tool: 't', argsJson: '{}', argsHash: 'h', ttlSec: -1 });
    const n = await storage.approvals.expirePending(Date.now());
    expect(n).toBe(1);
    const a = await storage.approvals.findById('app_1');
    expect(a?.status).toBe('expired');
  });

  it('recordExecution stores result + status', async () => {
    await storage.approvals.create({ id: 'app_1', principalId: 'prn_caller', tool: 't', argsJson: '{}', argsHash: 'h', ttlSec: 60 });
    await storage.approvals.decide('app_1', 'approved', 'prn_admin');
    await storage.approvals.recordExecution('app_1', 'executed', '{"r":42}');
    const a = await storage.approvals.findById('app_1');
    expect(a?.status).toBe('executed');
    expect(a?.resultJson).toBe('{"r":42}');
  });
});
