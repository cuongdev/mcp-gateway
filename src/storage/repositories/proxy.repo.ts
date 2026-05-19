import type { Client } from '@libsql/client';

export interface ProxyRow {
  id: string;
  name: string;
  url: string;
  description: string | null;
  enabled: boolean;
  createdAt: number;
}

export interface CreateProxyInput {
  id: string;
  name: string;
  url: string;
  description?: string;
}

export interface ProxyReference {
  kind: 'server' | 'group';
  name: string;
}

export class ProxyRepo {
  constructor(protected readonly client: Client) {}

  async create(input: CreateProxyInput): Promise<ProxyRow> {
    const now = Date.now();
    await this.client.execute({
      sql: `INSERT INTO proxies(id, name, url, description, enabled, created_at)
            VALUES (?, ?, ?, ?, 1, ?)`,
      args: [input.id, input.name, input.url, input.description ?? null, now],
    });
    const row = await this.findById(input.id);
    if (!row) throw new Error('Failed to read back proxy');
    return row;
  }

  async findById(id: string): Promise<ProxyRow | null> {
    const r = await this.client.execute({
      sql: 'SELECT id, name, url, description, enabled, created_at FROM proxies WHERE id = ?',
      args: [id],
    });
    if (r.rows.length === 0) return null;
    return rowToProxy(r.rows[0]);
  }

  async findByName(name: string): Promise<ProxyRow | null> {
    const r = await this.client.execute({
      sql: 'SELECT id, name, url, description, enabled, created_at FROM proxies WHERE name = ?',
      args: [name],
    });
    if (r.rows.length === 0) return null;
    return rowToProxy(r.rows[0]);
  }

  async list(): Promise<ProxyRow[]> {
    const r = await this.client.execute(
      'SELECT id, name, url, description, enabled, created_at FROM proxies ORDER BY name',
    );
    return r.rows.map(rowToProxy);
  }

  async update(id: string, patch: { url?: string; description?: string }): Promise<void> {
    const sets: string[] = [];
    const args: unknown[] = [];
    if (patch.url !== undefined) { sets.push('url = ?'); args.push(patch.url); }
    if (patch.description !== undefined) { sets.push('description = ?'); args.push(patch.description); }
    if (sets.length === 0) return;
    args.push(id);
    await this.client.execute({
      sql: `UPDATE proxies SET ${sets.join(', ')} WHERE id = ?`,
      args: args as never,
    });
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    await this.client.execute({
      sql: 'UPDATE proxies SET enabled = ? WHERE id = ?',
      args: [enabled ? 1 : 0, id],
    });
  }

  async delete(id: string): Promise<void> {
    await this.client.execute({ sql: 'DELETE FROM proxies WHERE id = ?', args: [id] });
  }

  async references(name: string): Promise<ProxyReference[]> {
    const refs: ProxyReference[] = [];
    const s = await this.client.execute({
      sql: 'SELECT name FROM servers WHERE proxy_name = ?',
      args: [name],
    });
    for (const row of s.rows) refs.push({ kind: 'server', name: row.name as string });
    const g = await this.client.execute({
      sql: 'SELECT name FROM groups WHERE proxy_name = ?',
      args: [name],
    });
    for (const row of g.rows) refs.push({ kind: 'group', name: row.name as string });
    return refs;
  }

  async detachAll(name: string): Promise<ProxyReference[]> {
    const refs = await this.references(name);
    await this.client.execute({
      sql: 'UPDATE servers SET proxy_name = NULL WHERE proxy_name = ?',
      args: [name],
    });
    await this.client.execute({
      sql: 'UPDATE groups SET proxy_name = NULL WHERE proxy_name = ?',
      args: [name],
    });
    return refs;
  }
}

function rowToProxy(r: Record<string, unknown>): ProxyRow {
  return {
    id: r.id as string,
    name: r.name as string,
    url: r.url as string,
    description: (r.description as string | null) ?? null,
    enabled: Number(r.enabled) === 1,
    createdAt: Number(r.created_at),
  };
}
