import type { Client } from '@libsql/client';

export interface UsageBucket {
  key: string;
  total: number;
  success: number;
  denied: number;
  error: number;
}

export interface AggregateUsageOptions {
  since?: number;
  until?: number;
  by: 'tool' | 'principal' | 'server';
  action?: string;
}

export interface AuditEntry {
  id: string;
  ts: number;
  principalId?: string;
  principalType?: string;
  action: string;
  resource?: string;
  result: 'success' | 'denied' | 'error';
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export interface NewAuditEntry {
  id: string;
  principalId?: string;
  principalType?: string;
  action: string;
  resource?: string;
  result: 'success' | 'denied' | 'error';
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export class AuditRepo {
  constructor(protected readonly client: Client) {}

  async write(e: NewAuditEntry): Promise<void> {
    await this.client.execute({
      sql: `INSERT INTO audit_logs(id, ts, principal_id, principal_type, action,
                                    resource, result, duration_ms, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [e.id, Date.now(),
             e.principalId ?? null, e.principalType ?? null,
             e.action, e.resource ?? null, e.result,
             e.durationMs ?? null,
             e.metadata ? JSON.stringify(e.metadata) : null],
    });
  }

  async listForPrincipal(principalId: string, limit = 100): Promise<AuditEntry[]> {
    const r = await this.client.execute({
      sql: `SELECT id, ts, principal_id, principal_type, action, resource, result,
                   duration_ms, metadata FROM audit_logs
            WHERE principal_id = ? ORDER BY ts DESC LIMIT ?`,
      args: [principalId, limit],
    });
    return r.rows.map(rowToEntry);
  }

  async listByAction(action: string, limit = 100): Promise<AuditEntry[]> {
    const r = await this.client.execute({
      sql: `SELECT id, ts, principal_id, principal_type, action, resource, result,
                   duration_ms, metadata FROM audit_logs
            WHERE action = ? ORDER BY ts DESC LIMIT ?`,
      args: [action, limit],
    });
    return r.rows.map(rowToEntry);
  }

  async aggregateUsage(opts: AggregateUsageOptions): Promise<UsageBucket[]> {
    const action = opts.action ?? 'tool.call';
    const since = opts.since ?? 0;
    const until = opts.until ?? Number.MAX_SAFE_INTEGER;
    const keyExpr =
      opts.by === 'tool' ? 'resource' :
      opts.by === 'principal' ? 'principal_id' :
      /* server */ `substr(resource, 1, instr(resource, '__') - 1)`;

    const r = await this.client.execute({
      sql: `
        SELECT ${keyExpr} AS key, result, COUNT(*) AS n
        FROM audit_logs
        WHERE action = ? AND ts >= ? AND ts <= ?
        GROUP BY key, result
      `,
      args: [action, since, until],
    });
    const buckets = new Map<string, UsageBucket>();
    for (const row of r.rows) {
      const key = (row.key as string | null) ?? '(none)';
      const n = Number(row.n);
      if (!buckets.has(key)) buckets.set(key, { key, total: 0, success: 0, denied: 0, error: 0 });
      const b = buckets.get(key)!;
      b.total += n;
      if (row.result === 'success') b.success += n;
      else if (row.result === 'denied') b.denied += n;
      else b.error += n;
    }
    return Array.from(buckets.values()).sort((a, b) => b.total - a.total);
  }
}

function rowToEntry(r: Record<string, unknown>): AuditEntry {
  return {
    id: r.id as string,
    ts: Number(r.ts),
    principalId: (r.principal_id as string | null) ?? undefined,
    principalType: (r.principal_type as string | null) ?? undefined,
    action: r.action as string,
    resource: (r.resource as string | null) ?? undefined,
    result: r.result as AuditEntry['result'],
    durationMs: (r.duration_ms as number | null) ?? undefined,
    metadata: r.metadata ? JSON.parse(r.metadata as string) : undefined,
  };
}
