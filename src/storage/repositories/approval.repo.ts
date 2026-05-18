import type { Client } from '@libsql/client';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'executed' | 'failed';

export interface ApprovalRow {
  id: string;
  tsRequested: number;
  tsDecided: number | null;
  tsExpires: number;
  status: ApprovalStatus;
  principalId: string;
  tool: string;
  argsJson: string;
  argsHash: string;
  approverId: string | null;
  decisionReason: string | null;
  resultJson: string | null;
}

export interface CreateApprovalInput {
  id: string;
  principalId: string;
  tool: string;
  argsJson: string;
  argsHash: string;
  ttlSec: number;
}

export class ApprovalRepo {
  constructor(protected readonly client: Client) {}

  async create(input: CreateApprovalInput): Promise<ApprovalRow> {
    const now = Date.now();
    const exp = now + input.ttlSec * 1000;
    await this.client.execute({
      sql: `INSERT INTO approvals(id, ts_requested, ts_expires, status, principal_id, tool, args_json, args_hash)
            VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)`,
      args: [input.id, now, exp, input.principalId, input.tool, input.argsJson, input.argsHash],
    });
    const row = await this.findById(input.id);
    if (!row) throw new Error('Failed to read back approval');
    return row;
  }

  async findById(id: string): Promise<ApprovalRow | null> {
    const r = await this.client.execute({
      sql: `SELECT id, ts_requested, ts_decided, ts_expires, status, principal_id, tool,
                   args_json, args_hash, approver_id, decision_reason, result_json
            FROM approvals WHERE id = ?`,
      args: [id],
    });
    if (r.rows.length === 0) return null;
    return rowToApproval(r.rows[0]);
  }

  async listPending(limit = 100): Promise<ApprovalRow[]> {
    const r = await this.client.execute({
      sql: `SELECT id, ts_requested, ts_decided, ts_expires, status, principal_id, tool,
                   args_json, args_hash, approver_id, decision_reason, result_json
            FROM approvals WHERE status = 'pending'
            ORDER BY ts_requested DESC LIMIT ?`,
      args: [limit],
    });
    return r.rows.map(rowToApproval);
  }

  async decide(id: string, status: 'approved' | 'rejected', approverId: string, reason?: string): Promise<boolean> {
    const r = await this.client.execute({
      sql: `UPDATE approvals
            SET status = ?, approver_id = ?, decision_reason = ?, ts_decided = ?
            WHERE id = ? AND status = 'pending'`,
      args: [status, approverId, reason ?? null, Date.now(), id],
    });
    return Number(r.rowsAffected) === 1;
  }

  async expirePending(asOfMs: number): Promise<number> {
    const r = await this.client.execute({
      sql: `UPDATE approvals SET status = 'expired'
            WHERE status = 'pending' AND ts_expires < ?`,
      args: [asOfMs],
    });
    return Number(r.rowsAffected);
  }

  async recordExecution(id: string, status: 'executed' | 'failed', resultJson: string | null): Promise<void> {
    await this.client.execute({
      sql: `UPDATE approvals SET status = ?, result_json = ?
            WHERE id = ? AND status = 'approved'`,
      args: [status, resultJson, id],
    });
  }
}

function rowToApproval(r: Record<string, unknown>): ApprovalRow {
  return {
    id: r.id as string,
    tsRequested: Number(r.ts_requested),
    tsDecided: r.ts_decided === null ? null : Number(r.ts_decided),
    tsExpires: Number(r.ts_expires),
    status: r.status as ApprovalStatus,
    principalId: r.principal_id as string,
    tool: r.tool as string,
    argsJson: r.args_json as string,
    argsHash: r.args_hash as string,
    approverId: (r.approver_id as string | null) ?? null,
    decisionReason: (r.decision_reason as string | null) ?? null,
    resultJson: (r.result_json as string | null) ?? null,
  };
}
