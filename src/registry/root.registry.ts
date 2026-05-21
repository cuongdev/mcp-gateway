import type { StorageAdapter } from '../storage/adapter.js';
import type { DiscoveredRoot, RootRow } from '../storage/repositories/root.repo.js';
import type { RootCapability } from '../capability/types.js';

export type RegisteredRoot = RootCapability;

function toCap(r: RootRow): RegisteredRoot {
  return {
    canonicalName: r.canonicalName,
    serverName: r.serverName,
    kind: 'root',
    enabled: true,
    sensitive: false,
    tenantId: r.tenantId,
    uri: r.uri,
    name: r.name ?? '',
  };
}

export class RootRegistry {
  private byCanonical = new Map<string, RegisteredRoot>();
  constructor(private readonly storage: StorageAdapter) {}

  async load(): Promise<void> {
    this.byCanonical.clear();
    for (const r of await this.storage.roots.list()) {
      this.byCanonical.set(r.canonicalName, toCap(r));
    }
  }

  async registerServerRoots(serverName: string, roots: DiscoveredRoot[]): Promise<void> {
    await this.storage.roots.replaceServerRoots(serverName, roots);
    for (const [k, v] of this.byCanonical) if (v.serverName === serverName) this.byCanonical.delete(k);
    const fresh = await this.storage.roots.listByServer(serverName);
    for (const r of fresh) this.byCanonical.set(r.canonicalName, toCap(r));
  }

  async deregister(serverName: string): Promise<void> {
    await this.storage.roots.replaceServerRoots(serverName, []);
    for (const [k, v] of this.byCanonical) if (v.serverName === serverName) this.byCanonical.delete(k);
  }

  list(): RegisteredRoot[] { return Array.from(this.byCanonical.values()); }
  listForServer(serverName: string): RegisteredRoot[] {
    return this.list().filter((c) => c.serverName === serverName);
  }
  get(canonical: string): RegisteredRoot | undefined { return this.byCanonical.get(canonical); }
}
