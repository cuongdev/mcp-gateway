import type { Client } from '@libsql/client';

export interface TokenRow {
  id: string;
  principalId: string;
  prefix: string;
  hash?: string;
  name?: string;
  scopes: string[];
  expiresAt?: number;
  lastUsedAt?: number;
  createdAt: number;
  revokedAt?: number;
}

export interface NewToken {
  id: string;
  principalId: string;
  prefix: string;
  hash: string;
  name?: string;
  scopes?: string[];
  expiresAt?: number;
}

export class TokenRepo {
  constructor(protected readonly client: Client) {}

  async create(t: NewToken): Promise<TokenRow> {
    const now = Date.now();
    await this.client.execute({
      sql: `INSERT INTO tokens(id, principal_id, prefix, hash, name, scopes, expires_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [t.id, t.principalId, t.prefix, t.hash, t.name ?? null,
             JSON.stringify(t.scopes ?? []), t.expiresAt ?? null, now],
    });
    return {
      id: t.id, principalId: t.principalId, prefix: t.prefix, hash: t.hash,
      name: t.name, scopes: t.scopes ?? [], expiresAt: t.expiresAt, createdAt: now,
    };
  }

  async findByPrefix(prefix: string): Promise<TokenRow | null> {
    const r = await this.client.execute({
      sql: `SELECT id, principal_id, prefix, hash, name, scopes, expires_at,
                   last_used_at, created_at, revoked_at
            FROM tokens WHERE prefix = ? LIMIT 1`,
      args: [prefix],
    });
    if (r.rows.length === 0) return null;
    return rowToToken(r.rows[0], true);
  }

  async updateLastUsed(id: string, ts: number): Promise<void> {
    await this.client.execute({
      sql: 'UPDATE tokens SET last_used_at = ? WHERE id = ?',
      args: [ts, id],
    });
  }

  async revoke(id: string): Promise<void> {
    await this.client.execute({
      sql: 'UPDATE tokens SET revoked_at = ? WHERE id = ?',
      args: [Date.now(), id],
    });
  }

  async listForPrincipal(principalId: string): Promise<TokenRow[]> {
    const r = await this.client.execute({
      sql: `SELECT id, principal_id, prefix, name, scopes, expires_at,
                   last_used_at, created_at, revoked_at
            FROM tokens WHERE principal_id = ? ORDER BY created_at DESC`,
      args: [principalId],
    });
    return r.rows.map((row) => rowToToken(row, false));
  }
}

function rowToToken(r: Record<string, unknown>, includeHash: boolean): TokenRow {
  return {
    id: r.id as string,
    principalId: r.principal_id as string,
    prefix: r.prefix as string,
    hash: includeHash ? (r.hash as string) : undefined,
    name: (r.name as string | null) ?? undefined,
    scopes: JSON.parse((r.scopes as string) ?? '[]'),
    expiresAt: (r.expires_at as number | null) ?? undefined,
    lastUsedAt: (r.last_used_at as number | null) ?? undefined,
    createdAt: Number(r.created_at),
    revokedAt: (r.revoked_at as number | null) ?? undefined,
  };
}
