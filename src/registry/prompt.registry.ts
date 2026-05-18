import type { StorageAdapter } from '../storage/adapter.js';
import type { PromptRow } from '../storage/repositories/prompt.repo.js';

export interface PromptDefinition {
  name: string;
  description: string;
  argumentsSchema: Record<string, unknown>;
}

export interface RegisteredPrompt {
  canonicalName: string;
  serverName: string;
  originalName: string;
  description: string;
  argumentsSchema: Record<string, unknown>;
  enabled: boolean;
}

function toRegistered(row: PromptRow): RegisteredPrompt {
  return {
    canonicalName: row.canonicalName,
    serverName: row.serverName,
    originalName: row.originalName,
    description: row.description,
    argumentsSchema: row.argumentsSchema,
    enabled: row.enabled,
  };
}

/**
 * In-memory mirror of the DB-backed prompt registry. Reads are served from
 * the in-memory map for speed; writes go to the DB and refresh the map.
 */
export class PromptRegistry {
  private byCanonical = new Map<string, RegisteredPrompt>();

  constructor(private readonly storage: StorageAdapter) {}

  /** Hydrate in-memory map from DB. Call once on startup. */
  async load(): Promise<void> {
    this.byCanonical.clear();
    for (const row of await this.storage.prompts.list()) {
      this.byCanonical.set(row.canonicalName, toRegistered(row));
    }
  }

  async registerServerPrompts(serverName: string, prompts: PromptDefinition[]): Promise<void> {
    await this.storage.prompts.replaceServerPrompts(
      serverName,
      prompts.map((p) => ({
        originalName: p.name,
        description: p.description,
        argumentsSchema: p.argumentsSchema,
      })),
    );
    // Refresh map for this server only
    for (const [k, v] of this.byCanonical) {
      if (v.serverName === serverName) this.byCanonical.delete(k);
    }
    for (const p of prompts) {
      const canonical = `${serverName}__${p.name}`;
      this.byCanonical.set(canonical, {
        canonicalName: canonical, serverName,
        originalName: p.name, description: p.description,
        argumentsSchema: p.argumentsSchema, enabled: true,
      });
    }
  }

  list(): RegisteredPrompt[] {
    return Array.from(this.byCanonical.values())
      .filter((p) => p.enabled)
      .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
  }

  listAll(): RegisteredPrompt[] {
    return Array.from(this.byCanonical.values())
      .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
  }

  get(canonical: string): RegisteredPrompt | undefined {
    return this.byCanonical.get(canonical);
  }

  async setEnabled(canonical: string, enabled: boolean): Promise<void> {
    await this.storage.prompts.setEnabled(canonical, enabled);
    const p = this.byCanonical.get(canonical);
    if (p) p.enabled = enabled;
  }

  async removeServer(serverName: string): Promise<void> {
    await this.storage.prompts.replaceServerPrompts(serverName, []);
    for (const [k, v] of this.byCanonical) {
      if (v.serverName === serverName) this.byCanonical.delete(k);
    }
  }

  get size(): number { return this.byCanonical.size; }
}
