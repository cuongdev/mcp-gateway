import type { StorageAdapter } from '../storage/adapter.js';
import type { ToolRegistry } from './tool.registry.js';
import type { GroupRow } from '../storage/repositories/group.repo.js';

export interface ToolGroup {
  name: string;
  description: string;
  tools: string[];
  enabled: boolean;
  allowedRoles: string[];
  createdAt: number;
  includedServers: string[];
  excludedTools: string[];
  /** Optional outbound proxy override for this group (P5). */
  proxyName?: string;
}

export interface CreateGroupOptions {
  description?: string;
  allowedRoles?: string[];
}

function toGroup(row: GroupRow): ToolGroup {
  return {
    name: row.name,
    description: row.description,
    tools: row.tools,
    enabled: row.enabled,
    allowedRoles: row.allowedRoles,
    createdAt: row.createdAt,
    includedServers: row.includedServers ?? [],
    excludedTools: row.excludedTools ?? [],
    proxyName: row.proxyName,
  };
}

export class ToolGroupManager {
  private byName = new Map<string, ToolGroup>();

  constructor(
    private readonly storage: StorageAdapter,
    private readonly registry: ToolRegistry,
  ) {}

  async load(): Promise<void> {
    this.byName.clear();
    for (const row of await this.storage.groups.list()) {
      this.byName.set(row.name, toGroup(row));
    }
  }

  async create(name: string, tools: string[], opts: CreateGroupOptions = {}): Promise<ToolGroup> {
    if (this.byName.has(name)) {
      throw new Error(`Group '${name}' already exists`);
    }
    // Validate tool names exist (warn but don't fail — discovery is async)
    const known = new Set(this.registry.listAll().map((t) => t.canonicalName));
    for (const t of tools) {
      if (!known.has(t)) {
        // soft warning — tool may be discovered later
      }
    }
    const row = await this.storage.groups.create({
      name,
      description: opts.description ?? '',
      allowedRoles: opts.allowedRoles ?? [],
      tools,
    });
    const g = toGroup(row);
    this.byName.set(name, g);
    return g;
  }

  get(name: string): ToolGroup | undefined {
    return this.byName.get(name);
  }

  list(): ToolGroup[] {
    return Array.from(this.byName.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async delete(name: string): Promise<void> {
    await this.storage.groups.deleteByName(name);
    this.byName.delete(name);
  }

  /** Resolve canonical tool names for this group, filtering by registry enable state. */
  resolveTools(name: string): string[] {
    const g = this.byName.get(name);
    if (!g) return [];
    const set = new Set<string>(g.tools);
    for (const serverName of g.includedServers) {
      for (const t of this.registry.listAll()) {
        if (t.serverName === serverName) set.add(t.canonicalName);
      }
    }
    for (const ex of g.excludedTools) {
      set.delete(ex);
    }
    return Array.from(set).filter((t) => this.registry.get(t)?.enabled).sort();
  }
}
