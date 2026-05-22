import type { Client } from '@libsql/client';

export type RedactionScope = 'request' | 'response';
export type RedactionFindingMode = 'redact' | 'block' | 'warn';

export interface RedactionFindingRow {
  id: string;
  ruleId: string;
  requestId: string;
  capabilityName: string | null;
  capabilityKind: string | null;
  serverName: string | null;
  scope: RedactionScope;
  mode: RedactionFindingMode;
  matchCount: number;
  occurredAt: number;
  principalId: string | null;
  tenantId: string;
}

export interface RecordFindingInput {
  id: string;
  ruleId: string;
  requestId: string;
  capabilityName?: string | null;
  capabilityKind?: string | null;
  serverName?: string | null;
  scope: RedactionScope;
  mode: RedactionFindingMode;
  matchCount: number;
  occurredAt?: number;
  principalId?: string | null;
  tenantId?: string;
}

export interface ListFindingsOpts {
  tenantId?: string;
  since?: number;
  ruleId?: string;
  serverName?: string;
  scope?: RedactionScope;
  mode?: RedactionFindingMode;
  principalId?: string;
  limit?: number;
}

export interface RuleStat {
  ruleId: string;
  count: number;
}

export interface ServerStat {
  serverName: string | null;
  count: number;
}

export class RedactionFindingRepo {
  constructor(protected readonly client: Client) {}

  async recordMany(findings: RecordFindingInput[]): Promise<void> {
    if (findings.length === 0) return;
    for (const f of findings) {
      const tenantId = f.tenantId ?? 'tnt_default';
      const occurredAt = f.occurredAt ?? Date.now();
      await this.client.execute({
        sql: `INSERT INTO redaction_findings
                (id, rule_id, request_id, capability_name, capability_kind,
                 server_name, scope, mode, match_count, occurred_at,
                 principal_id, tenant_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          f.id,
          f.ruleId,
          f.requestId,
          f.capabilityName ?? null,
          f.capabilityKind ?? null,
          f.serverName ?? null,
          f.scope,
          f.mode,
          f.matchCount,
          occurredAt,
          f.principalId ?? null,
          tenantId,
        ],
      });
    }
  }

  async list(opts: ListFindingsOpts = {}): Promise<RedactionFindingRow[]> {
    const tenantId = opts.tenantId ?? 'tnt_default';
    const clauses: string[] = ['tenant_id = ?'];
    const args: unknown[] = [tenantId];
    if (opts.since !== undefined) { clauses.push('occurred_at >= ?'); args.push(opts.since); }
    if (opts.ruleId)        { clauses.push('rule_id = ?');     args.push(opts.ruleId); }
    if (opts.serverName)    { clauses.push('server_name = ?'); args.push(opts.serverName); }
    if (opts.scope)         { clauses.push('scope = ?');       args.push(opts.scope); }
    if (opts.mode)          { clauses.push('mode = ?');        args.push(opts.mode); }
    if (opts.principalId)   { clauses.push('principal_id = ?'); args.push(opts.principalId); }

    const limit = Math.min(opts.limit ?? 100, 1000);
    const r = await this.client.execute({
      sql: `SELECT * FROM redaction_findings
            WHERE ${clauses.join(' AND ')}
            ORDER BY occurred_at DESC
            LIMIT ${limit}`,
      args: args as never,
    });
    return r.rows.map(rowToFinding);
  }

  async statsByRule(since: number, tenantId = 'tnt_default'): Promise<RuleStat[]> {
    const r = await this.client.execute({
      sql: `SELECT rule_id, SUM(match_count) AS cnt
              FROM redaction_findings
             WHERE tenant_id = ? AND occurred_at >= ?
             GROUP BY rule_id
             ORDER BY cnt DESC`,
      args: [tenantId, since],
    });
    return r.rows.map((row) => ({
      ruleId: String(row.rule_id),
      count: Number(row.cnt ?? 0),
    }));
  }

  async statsByServer(since: number, tenantId = 'tnt_default'): Promise<ServerStat[]> {
    const r = await this.client.execute({
      sql: `SELECT server_name, SUM(match_count) AS cnt
              FROM redaction_findings
             WHERE tenant_id = ? AND occurred_at >= ?
             GROUP BY server_name
             ORDER BY cnt DESC`,
      args: [tenantId, since],
    });
    return r.rows.map((row) => ({
      serverName: row.server_name == null ? null : String(row.server_name),
      count: Number(row.cnt ?? 0),
    }));
  }

  async purgeOlderThan(ts: number, tenantId?: string): Promise<number> {
    if (tenantId) {
      const r = await this.client.execute({
        sql: 'DELETE FROM redaction_findings WHERE tenant_id = ? AND occurred_at < ?',
        args: [tenantId, ts],
      });
      return r.rowsAffected;
    }
    const r = await this.client.execute({
      sql: 'DELETE FROM redaction_findings WHERE occurred_at < ?',
      args: [ts],
    });
    return r.rowsAffected;
  }
}

function rowToFinding(r: Record<string, unknown>): RedactionFindingRow {
  return {
    id: String(r.id),
    ruleId: String(r.rule_id),
    requestId: String(r.request_id),
    capabilityName: r.capability_name == null ? null : String(r.capability_name),
    capabilityKind: r.capability_kind == null ? null : String(r.capability_kind),
    serverName: r.server_name == null ? null : String(r.server_name),
    scope: String(r.scope) as RedactionScope,
    mode: String(r.mode) as RedactionFindingMode,
    matchCount: Number(r.match_count),
    occurredAt: Number(r.occurred_at),
    principalId: r.principal_id == null ? null : String(r.principal_id),
    tenantId: String(r.tenant_id),
  };
}
