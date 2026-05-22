// ============================================================
// CatalogInstallRepo — connector install records (P9, spec §8)
//
// Backed by `catalog_installs` (migration 0009). Caller is
// responsible for redacting secrets in `configSnapshotJson`
// BEFORE calling create(); the repo persists the string as-is.
// ============================================================

import type { Client } from '@libsql/client';

export interface CatalogInstallRow {
  id: string;
  connectorId: string;
  templateVersion: string;
  serverName: string;
  configSnapshotJson: string;
  installedAt: number;
  installedBy: string | null;
  tenantId: string;
}

export interface CreateCatalogInstallInput {
  id: string;
  connectorId: string;
  templateVersion: string;
  serverName: string;
  /** Already-redacted JSON string (secrets replaced with '***') */
  configSnapshotJson: string;
  installedBy?: string | null;
  tenantId?: string;
}

const COLS = `id, connector_id, template_version, server_name,
              config_snapshot_json, installed_at, installed_by, tenant_id`;

export class CatalogInstallRepo {
  constructor(protected readonly client: Client) {}

  async create(input: CreateCatalogInstallInput): Promise<CatalogInstallRow> {
    const now = Date.now();
    const tenantId = input.tenantId ?? 'tnt_default';
    await this.client.execute({
      sql: `INSERT INTO catalog_installs(${COLS})
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        input.id,
        input.connectorId,
        input.templateVersion,
        input.serverName,
        input.configSnapshotJson,
        now,
        input.installedBy ?? null,
        tenantId,
      ],
    });
    const found = await this.findById(input.id);
    if (!found) throw new Error('Failed to read back catalog install');
    return found;
  }

  async findById(id: string): Promise<CatalogInstallRow | null> {
    const r = await this.client.execute({
      sql: `SELECT ${COLS} FROM catalog_installs WHERE id = ?`,
      args: [id],
    });
    if (r.rows.length === 0) return null;
    return rowToInstall(r.rows[0]);
  }

  async findByServerName(
    serverName: string,
    tenantId: string = 'tnt_default',
  ): Promise<CatalogInstallRow | null> {
    const r = await this.client.execute({
      sql: `SELECT ${COLS} FROM catalog_installs
            WHERE tenant_id = ? AND server_name = ?`,
      args: [tenantId, serverName],
    });
    if (r.rows.length === 0) return null;
    return rowToInstall(r.rows[0]);
  }

  async list(tenantId: string = 'tnt_default'): Promise<CatalogInstallRow[]> {
    const r = await this.client.execute({
      sql: `SELECT ${COLS} FROM catalog_installs
            WHERE tenant_id = ?
            ORDER BY installed_at DESC`,
      args: [tenantId],
    });
    return r.rows.map(rowToInstall);
  }

  async delete(id: string): Promise<void> {
    await this.client.execute({
      sql: 'DELETE FROM catalog_installs WHERE id = ?',
      args: [id],
    });
  }
}

function rowToInstall(r: Record<string, unknown>): CatalogInstallRow {
  // Postgres returns config_snapshot_json as a parsed JSON object (JSONB);
  // sqlite returns it as a TEXT string. Normalize to string.
  const snap = r.config_snapshot_json;
  const snapStr = typeof snap === 'string' ? snap : JSON.stringify(snap);
  return {
    id: r.id as string,
    connectorId: r.connector_id as string,
    templateVersion: r.template_version as string,
    serverName: r.server_name as string,
    configSnapshotJson: snapStr,
    installedAt: Number(r.installed_at),
    installedBy: (r.installed_by as string | null) ?? null,
    tenantId: r.tenant_id as string,
  };
}
