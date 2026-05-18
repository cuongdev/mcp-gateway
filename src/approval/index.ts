import { createHash } from 'node:crypto';
import { newId } from '../utils/uuid.js';
import type { StorageAdapter } from '../storage/adapter.js';
import type { ApprovalRow } from '../storage/repositories/approval.repo.js';

export interface ApprovalConfig {
  enabled: boolean;
  defaultTtlSec: number;
  approverRoles: string[];
}

export interface RequestApprovalInput {
  principalId: string;
  tool: string;
  args: unknown;
}

export class ApprovalService {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly cfg: ApprovalConfig,
  ) {}

  async request(input: RequestApprovalInput): Promise<ApprovalRow> {
    const id = `app_${newId().slice(4)}`;
    const argsJson = JSON.stringify(input.args ?? {});
    const argsHash = createHash('sha256').update(argsJson).digest('hex');
    return this.storage.approvals.create({
      id, principalId: input.principalId, tool: input.tool,
      argsJson, argsHash, ttlSec: this.cfg.defaultTtlSec,
    });
  }

  async approve(id: string, approverId: string, reason?: string): Promise<boolean> {
    return this.storage.approvals.decide(id, 'approved', approverId, reason);
  }

  async reject(id: string, approverId: string, reason?: string): Promise<boolean> {
    return this.storage.approvals.decide(id, 'rejected', approverId, reason);
  }

  async expireOverdue(): Promise<number> {
    return this.storage.approvals.expirePending(Date.now());
  }

  async recordResult(id: string, status: 'executed' | 'failed', resultJson: string | null): Promise<void> {
    await this.storage.approvals.recordExecution(id, status, resultJson);
  }

  async get(id: string): Promise<ApprovalRow | null> {
    return this.storage.approvals.findById(id);
  }

  async listPending(): Promise<ApprovalRow[]> {
    return this.storage.approvals.listPending();
  }
}
