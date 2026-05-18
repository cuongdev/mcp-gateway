import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../src/storage/sqlite.adapter.js';
import { ApprovalService } from '../../../src/approval/index.js';

describe('ApprovalService', () => {
  let storage: SqliteAdapter;
  let service: ApprovalService;
  beforeEach(async () => {
    storage = await makeStorage();
    await storage.principals.createServiceAccount({ id: 'prn_caller', displayName: 'a' });
    await storage.principals.createServiceAccount({ id: 'prn_admin', displayName: 'b' });
    service = new ApprovalService(storage, { enabled: true, defaultTtlSec: 60, approverRoles: ['admin'] });
  });
  afterEach(async () => { await storage.close(); });

  it('request creates pending approval', async () => {
    const a = await service.request({ principalId: 'prn_caller', tool: 'db__delete', args: { id: 1 } });
    expect(a.status).toBe('pending');
    expect(a.tool).toBe('db__delete');
  });

  it('approve flips to approved', async () => {
    const a = await service.request({ principalId: 'prn_caller', tool: 't', args: {} });
    expect(await service.approve(a.id, 'prn_admin', 'lgtm')).toBe(true);
    expect((await service.get(a.id))?.status).toBe('approved');
  });

  it('expireOverdue marks past entries', async () => {
    await storage.approvals.create({
      id: 'app_x', principalId: 'prn_caller', tool: 't', argsJson: '{}', argsHash: 'h', ttlSec: -1,
    });
    expect(await service.expireOverdue()).toBe(1);
    expect((await service.get('app_x'))?.status).toBe('expired');
  });
});
