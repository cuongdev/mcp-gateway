import type { Client } from '@libsql/client';

export interface ToolRow {
  canonicalName: string;
  serverName: string;
  originalName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  enabled: boolean;
  discoveredAt: number;
  cacheable: boolean;
  cacheTtlSec: number | null;
  cachePerPrincipal: boolean;
}

export interface DiscoveredTool {
  originalName: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export class ToolRepo {
  constructor(protected readonly client: Client) {}

  async replaceServerTools(serverName: string, tools: DiscoveredTool[]): Promise<void> {
    const now = Date.now();
    // NOTE: the SqliteAdapter.transaction() implementation uses manual BEGIN/COMMIT.
    // For repo methods we use raw client.execute() in sequence; if the second insert
    // fails, the first one stays. This is acceptable for P0 — the failure mode is
    // partial tool inventory until next discover. If you need true atomicity here,
    // use this.client.execute('BEGIN') then COMMIT/ROLLBACK manually.
    await this.client.execute({ sql: 'DELETE FROM tools WHERE server_name = ?', args: [serverName] });
    for (const t of tools) {
      const canonical = `${serverName}__${t.originalName}`;
      await this.client.execute({
        sql: `INSERT INTO tools(canonical_name, server_name, original_name, description,
                                input_schema, enabled, discovered_at,
                                cacheable, cache_ttl_sec, cache_per_principal)
              VALUES (?, ?, ?, ?, ?, 1, ?, 0, NULL, 0)`,
        args: [canonical, serverName, t.originalName, t.description,
               JSON.stringify(t.inputSchema), now],
      });
    }
  }

  async findByCanonicalName(canonicalName: string): Promise<ToolRow | null> {
    const r = await this.client.execute({
      sql: `SELECT canonical_name, server_name, original_name, description,
                   input_schema, enabled, discovered_at,
                   cacheable, cache_ttl_sec, cache_per_principal
            FROM tools WHERE canonical_name = ?`,
      args: [canonicalName],
    });
    if (r.rows.length === 0) return null;
    return rowToTool(r.rows[0]);
  }

  async list(): Promise<ToolRow[]> {
    const r = await this.client.execute(
      `SELECT canonical_name, server_name, original_name, description,
              input_schema, enabled, discovered_at,
              cacheable, cache_ttl_sec, cache_per_principal
       FROM tools ORDER BY canonical_name`
    );
    return r.rows.map(rowToTool);
  }

  async listForServer(serverName: string): Promise<ToolRow[]> {
    const r = await this.client.execute({
      sql: `SELECT canonical_name, server_name, original_name, description,
                   input_schema, enabled, discovered_at,
                   cacheable, cache_ttl_sec, cache_per_principal
            FROM tools WHERE server_name = ? ORDER BY canonical_name`,
      args: [serverName],
    });
    return r.rows.map(rowToTool);
  }

  async setCacheFlags(
    canonical: string,
    flags: { cacheable: boolean; cacheTtlSec: number | null; cachePerPrincipal: boolean },
  ): Promise<void> {
    await this.client.execute({
      sql: `UPDATE tools
            SET cacheable = ?, cache_ttl_sec = ?, cache_per_principal = ?
            WHERE canonical_name = ?`,
      args: [flags.cacheable ? 1 : 0, flags.cacheTtlSec, flags.cachePerPrincipal ? 1 : 0, canonical],
    });
  }

  async setEnabled(canonicalName: string, enabled: boolean): Promise<void> {
    await this.client.execute({
      sql: 'UPDATE tools SET enabled = ? WHERE canonical_name = ?',
      args: [enabled ? 1 : 0, canonicalName],
    });
  }
}

function rowToTool(r: Record<string, unknown>): ToolRow {
  return {
    canonicalName: r.canonical_name as string,
    serverName: r.server_name as string,
    originalName: r.original_name as string,
    description: (r.description as string | null) ?? '',
    inputSchema: JSON.parse(r.input_schema as string),
    enabled: Number(r.enabled) === 1,
    discoveredAt: Number(r.discovered_at),
    cacheable: Number(r.cacheable) === 1,
    cacheTtlSec: r.cache_ttl_sec === null ? null : Number(r.cache_ttl_sec),
    cachePerPrincipal: Number(r.cache_per_principal) === 1,
  };
}
