import { createHash } from 'node:crypto';
import type { Client } from '@libsql/client';

export interface ResourceRow {
  canonicalName: string;
  serverName: string;
  uri: string;
  name: string | null;
  description: string | null;
  mimeType: string | null;
  enabled: boolean;
  sensitive: boolean;
  discoveredAt: number;
  tenantId: string;
}

export interface DiscoveredResource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export interface ResourceTemplateRow {
  id: string;
  serverName: string;
  uriTemplate: string;
  name: string | null;
  description: string | null;
  mimeType: string | null;
  discoveredAt: number;
  tenantId: string;
}

export interface DiscoveredResourceTemplate {
  uriTemplate: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

function canonicalize(serverName: string, uri: string): string {
  const hash = createHash('sha256').update(uri).digest('hex').slice(0, 16);
  return `${serverName}__${hash}`;
}

/**
 * Repository for MCP `resources/*` capability. Canonical names hash the URI
 * because URIs can be very long; the 16-char hex prefix is collision-resistant
 * within a single server's namespace.
 */
export class ResourceRepo {
  constructor(protected readonly client: Client) {}

  async replaceServerResources(
    serverName: string,
    resources: DiscoveredResource[],
    tenantId = 'tnt_default',
  ): Promise<void> {
    const now = Date.now();
    await this.client.execute({
      sql: 'DELETE FROM resources WHERE server_name = ? AND tenant_id = ?',
      args: [serverName, tenantId],
    });
    for (const r of resources) {
      await this.client.execute({
        sql: `INSERT INTO resources (canonical_name, server_name, uri, name, description, mime_type,
                                     enabled, sensitive, discovered_at, tenant_id)
              VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
        args: [
          canonicalize(serverName, r.uri), serverName, r.uri,
          r.name ?? null, r.description ?? null, r.mimeType ?? null,
          now, tenantId,
        ],
      });
    }
  }

  async listByServer(serverName: string, tenantId = 'tnt_default'): Promise<ResourceRow[]> {
    const r = await this.client.execute({
      sql: `SELECT canonical_name, server_name, uri, name, description, mime_type,
                   enabled, sensitive, discovered_at, tenant_id
            FROM resources WHERE server_name = ? AND tenant_id = ? ORDER BY uri`,
      args: [serverName, tenantId],
    });
    return r.rows.map(rowToResource);
  }

  async list(tenantId = 'tnt_default'): Promise<ResourceRow[]> {
    const r = await this.client.execute({
      sql: `SELECT canonical_name, server_name, uri, name, description, mime_type,
                   enabled, sensitive, discovered_at, tenant_id
            FROM resources WHERE tenant_id = ? ORDER BY server_name, uri`,
      args: [tenantId],
    });
    return r.rows.map(rowToResource);
  }

  async findByCanonicalName(canonicalName: string, tenantId = 'tnt_default'): Promise<ResourceRow | null> {
    const r = await this.client.execute({
      sql: `SELECT canonical_name, server_name, uri, name, description, mime_type,
                   enabled, sensitive, discovered_at, tenant_id
            FROM resources WHERE canonical_name = ? AND tenant_id = ?`,
      args: [canonicalName, tenantId],
    });
    if (r.rows.length === 0) return null;
    return rowToResource(r.rows[0]);
  }

  async setEnabled(canonicalName: string, enabled: boolean, tenantId = 'tnt_default'): Promise<void> {
    await this.client.execute({
      sql: 'UPDATE resources SET enabled = ? WHERE canonical_name = ? AND tenant_id = ?',
      args: [enabled ? 1 : 0, canonicalName, tenantId],
    });
  }

  async setSensitive(canonicalName: string, sensitive: boolean, tenantId = 'tnt_default'): Promise<void> {
    await this.client.execute({
      sql: 'UPDATE resources SET sensitive = ? WHERE canonical_name = ? AND tenant_id = ?',
      args: [sensitive ? 1 : 0, canonicalName, tenantId],
    });
  }

  // ───── Resource Templates ─────

  async replaceServerTemplates(
    serverName: string,
    templates: DiscoveredResourceTemplate[],
    tenantId = 'tnt_default',
  ): Promise<void> {
    const now = Date.now();
    await this.client.execute({
      sql: 'DELETE FROM resource_templates WHERE server_name = ? AND tenant_id = ?',
      args: [serverName, tenantId],
    });
    for (const t of templates) {
      const id = canonicalize(serverName, t.uriTemplate);
      await this.client.execute({
        sql: `INSERT INTO resource_templates (id, server_name, uri_template, name, description, mime_type,
                                              discovered_at, tenant_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, serverName, t.uriTemplate, t.name ?? null, t.description ?? null, t.mimeType ?? null, now, tenantId],
      });
    }
  }

  async listTemplatesByServer(serverName: string, tenantId = 'tnt_default'): Promise<ResourceTemplateRow[]> {
    const r = await this.client.execute({
      sql: `SELECT id, server_name, uri_template, name, description, mime_type, discovered_at, tenant_id
            FROM resource_templates WHERE server_name = ? AND tenant_id = ? ORDER BY uri_template`,
      args: [serverName, tenantId],
    });
    return r.rows.map(rowToResourceTemplate);
  }

  async listTemplates(tenantId = 'tnt_default'): Promise<ResourceTemplateRow[]> {
    const r = await this.client.execute({
      sql: `SELECT id, server_name, uri_template, name, description, mime_type, discovered_at, tenant_id
            FROM resource_templates WHERE tenant_id = ? ORDER BY server_name, uri_template`,
      args: [tenantId],
    });
    return r.rows.map(rowToResourceTemplate);
  }
}

function rowToResource(r: Record<string, unknown>): ResourceRow {
  return {
    canonicalName: String(r.canonical_name),
    serverName: String(r.server_name),
    uri: String(r.uri),
    name: r.name == null ? null : String(r.name),
    description: r.description == null ? null : String(r.description),
    mimeType: r.mime_type == null ? null : String(r.mime_type),
    enabled: Number(r.enabled) === 1,
    sensitive: Number(r.sensitive) === 1,
    discoveredAt: Number(r.discovered_at),
    tenantId: String(r.tenant_id),
  };
}

function rowToResourceTemplate(r: Record<string, unknown>): ResourceTemplateRow {
  return {
    id: String(r.id),
    serverName: String(r.server_name),
    uriTemplate: String(r.uri_template),
    name: r.name == null ? null : String(r.name),
    description: r.description == null ? null : String(r.description),
    mimeType: r.mime_type == null ? null : String(r.mime_type),
    discoveredAt: Number(r.discovered_at),
    tenantId: String(r.tenant_id),
  };
}
