// ============================================================
// SamplingLogRepo — P8 admin audit trail for reverse-channel
// (sampling/createMessage, roots/list) attempts.
//
// In v0.8 the full reverse channel multiplexer is deferred to
// v0.9. This repo provides the persistence layer so that any
// sampling-related traffic seen by the gateway is logged for
// admin visibility, even when the gateway can't fulfil the
// request itself.
// ============================================================

import type { Client } from '@libsql/client';

export type SamplingOutcome = 'success' | 'client_refused' | 'timeout' | 'error' | 'method_not_supported';

export interface SamplingLogRow {
  id: string;
  requestId: string;
  upstreamServer: string;
  clientSessionId: string;
  principalId: string | null;
  method: string;                  // 'sampling/createMessage' | 'roots/list'
  requestPayloadHash: string;
  responsePayloadHash: string | null;
  latencyMs: number | null;
  outcome: SamplingOutcome;
  occurredAt: number;
  tenantId: string;
}

export interface SamplingLogInput {
  id: string;
  requestId: string;
  upstreamServer: string;
  clientSessionId: string;
  principalId?: string | null;
  method: string;
  requestPayloadHash: string;
  responsePayloadHash?: string | null;
  latencyMs?: number | null;
  outcome: SamplingOutcome;
  tenantId?: string;
}

export interface SamplingLogFilter {
  since?: number;
  serverName?: string;
  outcome?: SamplingOutcome;
  method?: string;
  principalId?: string;
  limit?: number;
}

export class SamplingLogRepo {
  constructor(protected readonly client: Client) {}

  async record(input: SamplingLogInput): Promise<void> {
    const now = Date.now();
    await this.client.execute({
      sql: `INSERT INTO sampling_log (id, request_id, upstream_server, client_session_id, principal_id,
                                       method, request_payload_hash, response_payload_hash,
                                       latency_ms, outcome, occurred_at, tenant_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        input.id, input.requestId, input.upstreamServer, input.clientSessionId,
        input.principalId ?? null, input.method,
        input.requestPayloadHash, input.responsePayloadHash ?? null,
        input.latencyMs ?? null, input.outcome, now,
        input.tenantId ?? 'tnt_default',
      ],
    });
  }

  async list(filter: SamplingLogFilter = {}, tenantId = 'tnt_default'): Promise<SamplingLogRow[]> {
    const clauses: string[] = ['tenant_id = ?'];
    const args: unknown[] = [tenantId];
    if (filter.since !== undefined) { clauses.push('occurred_at >= ?'); args.push(filter.since); }
    if (filter.serverName) { clauses.push('upstream_server = ?'); args.push(filter.serverName); }
    if (filter.outcome) { clauses.push('outcome = ?'); args.push(filter.outcome); }
    if (filter.method) { clauses.push('method = ?'); args.push(filter.method); }
    if (filter.principalId) { clauses.push('principal_id = ?'); args.push(filter.principalId); }
    const limit = Math.min(Math.max(filter.limit ?? 200, 1), 1000);
    const r = await this.client.execute({
      sql: `SELECT id, request_id, upstream_server, client_session_id, principal_id,
                   method, request_payload_hash, response_payload_hash,
                   latency_ms, outcome, occurred_at, tenant_id
            FROM sampling_log WHERE ${clauses.join(' AND ')}
            ORDER BY occurred_at DESC LIMIT ${limit}`,
      args: args as never,
    });
    return r.rows.map(rowToLog);
  }

  async stats(since: number, tenantId = 'tnt_default'): Promise<{ totalSince: number; byOutcome: Array<{ outcome: SamplingOutcome; count: number }>; byServer: Array<{ serverName: string; count: number }> }> {
    const total = await this.client.execute({
      sql: 'SELECT COUNT(*) AS c FROM sampling_log WHERE tenant_id = ? AND occurred_at >= ?',
      args: [tenantId, since],
    });
    const totalSince = Number(total.rows[0]?.c ?? 0);

    const outcomeRows = await this.client.execute({
      sql: `SELECT outcome, COUNT(*) AS c FROM sampling_log
            WHERE tenant_id = ? AND occurred_at >= ?
            GROUP BY outcome ORDER BY c DESC`,
      args: [tenantId, since],
    });
    const byOutcome = outcomeRows.rows.map((r) => ({
      outcome: String(r.outcome) as SamplingOutcome,
      count: Number(r.c),
    }));

    const serverRows = await this.client.execute({
      sql: `SELECT upstream_server AS srv, COUNT(*) AS c FROM sampling_log
            WHERE tenant_id = ? AND occurred_at >= ?
            GROUP BY upstream_server ORDER BY c DESC LIMIT 10`,
      args: [tenantId, since],
    });
    const byServer = serverRows.rows.map((r) => ({
      serverName: String(r.srv),
      count: Number(r.c),
    }));

    return { totalSince, byOutcome, byServer };
  }

  async purgeOlderThan(tsMs: number, tenantId = 'tnt_default'): Promise<number> {
    const r = await this.client.execute({
      sql: 'DELETE FROM sampling_log WHERE tenant_id = ? AND occurred_at < ?',
      args: [tenantId, tsMs],
    });
    return r.rowsAffected;
  }
}

function rowToLog(r: Record<string, unknown>): SamplingLogRow {
  return {
    id: String(r.id),
    requestId: String(r.request_id),
    upstreamServer: String(r.upstream_server),
    clientSessionId: String(r.client_session_id),
    principalId: r.principal_id == null ? null : String(r.principal_id),
    method: String(r.method),
    requestPayloadHash: String(r.request_payload_hash),
    responsePayloadHash: r.response_payload_hash == null ? null : String(r.response_payload_hash),
    latencyMs: r.latency_ms == null ? null : Number(r.latency_ms),
    outcome: String(r.outcome) as SamplingOutcome,
    occurredAt: Number(r.occurred_at),
    tenantId: String(r.tenant_id),
  };
}
