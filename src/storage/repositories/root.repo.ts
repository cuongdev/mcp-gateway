import { createHash } from 'node:crypto';
import type { Client } from '@libsql/client';

export interface RootRow {
  canonicalName: string;
  serverName: string;
  uri: string;
  name: string | null;
  discoveredAt: number;
  tenantId: string;
}

export interface DiscoveredRoot {
  uri: string;
  name?: string;
}

function canonicalize(serverName: string, uri: string): string {
  const hash = createHash('sha256').update(uri).digest('hex').slice(0, 16);
  return `${serverName}__root_${hash}`;
}

/**
 * Repository for MCP roots (workspace boundaries). Roots are reported BY the
 * MCP client to the upstream server, but the gateway caches discovered roots
 * for admin visibility.
 */
export class RootRepo {
  constructor(protected readonly client: Client) {}

  async replaceServerRoots(
    serverName: string,
    roots: DiscoveredRoot[],
    tenantId = 'tnt_default',
  ): Promise<void> {
    const now = Date.now();
    await this.client.execute({
      sql: 'DELETE FROM roots WHERE server_name = ? AND tenant_id = ?',
      args: [serverName, tenantId],
    });
    for (const r of roots) {
      await this.client.execute({
        sql: `INSERT INTO roots (canonical_name, server_name, uri, name, discovered_at, tenant_id)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [canonicalize(serverName, r.uri), serverName, r.uri, r.name ?? null, now, tenantId],
      });
    }
  }

  async list(tenantId = 'tnt_default'): Promise<RootRow[]> {
    const r = await this.client.execute({
      sql: `SELECT canonical_name, server_name, uri, name, discovered_at, tenant_id
            FROM roots WHERE tenant_id = ? ORDER BY server_name, uri`,
      args: [tenantId],
    });
    return r.rows.map(rowToRoot);
  }

  async listByServer(serverName: string, tenantId = 'tnt_default'): Promise<RootRow[]> {
    const r = await this.client.execute({
      sql: `SELECT canonical_name, server_name, uri, name, discovered_at, tenant_id
            FROM roots WHERE server_name = ? AND tenant_id = ? ORDER BY uri`,
      args: [serverName, tenantId],
    });
    return r.rows.map(rowToRoot);
  }
}

function rowToRoot(r: Record<string, unknown>): RootRow {
  return {
    canonicalName: String(r.canonical_name),
    serverName: String(r.server_name),
    uri: String(r.uri),
    name: r.name == null ? null : String(r.name),
    discoveredAt: Number(r.discovered_at),
    tenantId: String(r.tenant_id),
  };
}
