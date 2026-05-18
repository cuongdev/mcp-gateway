import type { Client } from '@libsql/client';

export interface CacheEntry {
  tool: string;
  value: string;             // serialized response body
  expiresAt: number;
  principalId?: string;
}

export interface StoredCacheEntry extends CacheEntry {
  keyHash: string;
  createdAt: number;
}

export class CacheEntryRepo {
  constructor(protected readonly client: Client) {}

  async set(keyHash: string, entry: CacheEntry): Promise<void> {
    const now = Date.now();
    await this.client.execute({
      sql: `INSERT INTO cache_entries(key_hash, tool, principal_id, value, expires_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(key_hash) DO UPDATE
              SET value = excluded.value,
                  expires_at = excluded.expires_at,
                  created_at = excluded.created_at`,
      args: [keyHash, entry.tool, entry.principalId ?? null, entry.value, entry.expiresAt, now],
    });
  }

  async get(keyHash: string): Promise<StoredCacheEntry | null> {
    const r = await this.client.execute({
      sql: `SELECT key_hash, tool, principal_id, value, expires_at, created_at
            FROM cache_entries WHERE key_hash = ?`,
      args: [keyHash],
    });
    if (r.rows.length === 0) return null;
    const row = r.rows[0];
    const expiresAt = Number(row.expires_at);
    if (expiresAt < Date.now()) {
      await this.delete(keyHash);
      return null;
    }
    return {
      keyHash: row.key_hash as string,
      tool: row.tool as string,
      principalId: (row.principal_id as string | null) ?? undefined,
      value: row.value as string,
      expiresAt,
      createdAt: Number(row.created_at),
    };
  }

  async delete(keyHash: string): Promise<void> {
    await this.client.execute({
      sql: 'DELETE FROM cache_entries WHERE key_hash = ?',
      args: [keyHash],
    });
  }

  async deleteByTool(tool: string): Promise<number> {
    const r = await this.client.execute({
      sql: 'DELETE FROM cache_entries WHERE tool = ?',
      args: [tool],
    });
    return Number(r.rowsAffected);
  }

  async deleteByPrincipal(principalId: string): Promise<number> {
    const r = await this.client.execute({
      sql: 'DELETE FROM cache_entries WHERE principal_id = ?',
      args: [principalId],
    });
    return Number(r.rowsAffected);
  }

  async purgeExpired(): Promise<number> {
    const r = await this.client.execute({
      sql: 'DELETE FROM cache_entries WHERE expires_at < ?',
      args: [Date.now()],
    });
    return Number(r.rowsAffected);
  }
}
