import type { Client } from '@libsql/client';

export interface UsageCounterRow {
  principalId: string;
  scope: string;
  count: number;
  updatedAt: number;
}

export class UsageCounterRepo {
  constructor(protected readonly client: Client) {}

  async increment(principalId: string, scope: string, delta: number): Promise<number> {
    const now = Date.now();
    await this.client.execute({
      sql: `INSERT INTO usage_counters(principal_id, scope, count, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(principal_id, scope) DO UPDATE
              SET count = count + excluded.count,
                  updated_at = excluded.updated_at`,
      args: [principalId, scope, delta, now],
    });
    return this.get(principalId, scope);
  }

  async get(principalId: string, scope: string): Promise<number> {
    const r = await this.client.execute({
      sql: 'SELECT count FROM usage_counters WHERE principal_id = ? AND scope = ?',
      args: [principalId, scope],
    });
    if (r.rows.length === 0) return 0;
    return Number(r.rows[0].count);
  }

  async listForPrincipal(principalId: string): Promise<UsageCounterRow[]> {
    const r = await this.client.execute({
      sql: `SELECT principal_id, scope, count, updated_at
            FROM usage_counters WHERE principal_id = ?
            ORDER BY scope`,
      args: [principalId],
    });
    return r.rows.map((row) => ({
      principalId: row.principal_id as string,
      scope: row.scope as string,
      count: Number(row.count),
      updatedAt: Number(row.updated_at),
    }));
  }

  async resetBefore(cutoffScope: string): Promise<number> {
    const r = await this.client.execute({
      sql: 'DELETE FROM usage_counters WHERE scope < ?',
      args: [cutoffScope],
    });
    return Number(r.rowsAffected);
  }
}
