import type { StorageAdapter } from '../storage/adapter.js';
import type { ToolRow } from '../storage/repositories/tool.repo.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface RegisteredTool {
  canonicalName: string;
  serverName: string;
  originalName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  enabled: boolean;
  cacheable: boolean;
  cacheTtlSec: number | null;
  cachePerPrincipal: boolean;
  sensitive: boolean;
}

function toRegistered(row: ToolRow): RegisteredTool {
  return {
    canonicalName: row.canonicalName,
    serverName: row.serverName,
    originalName: row.originalName,
    description: row.description,
    inputSchema: row.inputSchema,
    enabled: row.enabled,
    cacheable: row.cacheable,
    cacheTtlSec: row.cacheTtlSec,
    cachePerPrincipal: row.cachePerPrincipal,
    sensitive: row.sensitive,
  };
}

/**
 * In-memory mirror of the DB-backed tool registry. Reads are served from
 * the in-memory map for speed; writes go to the DB and refresh the map.
 */
export class ToolRegistry {
  private byCanonical = new Map<string, RegisteredTool>();

  constructor(private readonly storage: StorageAdapter) {}

  /** Hydrate in-memory map from DB. Call once on startup. */
  async load(): Promise<void> {
    this.byCanonical.clear();
    const rows = await this.storage.tools.list();
    for (const r of rows) this.byCanonical.set(r.canonicalName, toRegistered(r));
  }

  async registerServerTools(serverName: string, tools: ToolDefinition[]): Promise<void> {
    await this.storage.tools.replaceServerTools(
      serverName,
      tools.map((t) => ({
        originalName: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    );
    // Refresh map for this server only
    for (const [k, v] of this.byCanonical) {
      if (v.serverName === serverName) this.byCanonical.delete(k);
    }
    for (const t of tools) {
      const canonical = `${serverName}__${t.name}`;
      this.byCanonical.set(canonical, {
        canonicalName: canonical, serverName,
        originalName: t.name, description: t.description,
        inputSchema: t.inputSchema, enabled: true,
        cacheable: false, cacheTtlSec: null, cachePerPrincipal: false,
        sensitive: false,
      });
    }
  }

  list(): RegisteredTool[] {
    return Array.from(this.byCanonical.values())
      .filter((t) => t.enabled)
      .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
  }

  listAll(): RegisteredTool[] {
    return Array.from(this.byCanonical.values())
      .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
  }

  get(canonicalName: string): RegisteredTool | undefined {
    return this.byCanonical.get(canonicalName);
  }

  async setEnabled(canonicalName: string, enabled: boolean): Promise<void> {
    await this.storage.tools.setEnabled(canonicalName, enabled);
    const t = this.byCanonical.get(canonicalName);
    if (t) t.enabled = enabled;
  }

  async removeServer(serverName: string): Promise<void> {
    await this.storage.tools.replaceServerTools(serverName, []);
    for (const [k, v] of this.byCanonical) {
      if (v.serverName === serverName) this.byCanonical.delete(k);
    }
  }

  get size(): number {
    return this.byCanonical.size;
  }
}
