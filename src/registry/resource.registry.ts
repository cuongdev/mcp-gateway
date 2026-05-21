import type { StorageAdapter } from '../storage/adapter.js';
import type { ResourceRow, DiscoveredResource, DiscoveredResourceTemplate, ResourceTemplateRow } from '../storage/repositories/resource.repo.js';
import type { ResourceCapability } from '../capability/types.js';

export type RegisteredResource = ResourceCapability;

function toCap(r: ResourceRow): RegisteredResource {
  return {
    canonicalName: r.canonicalName,
    serverName: r.serverName,
    kind: 'resource',
    enabled: r.enabled,
    sensitive: r.sensitive,
    tenantId: r.tenantId,
    uri: r.uri,
    name: r.name ?? '',
    description: r.description ?? '',
    mimeType: r.mimeType ?? undefined,
  };
}

export class ResourceRegistry {
  private byCanonical = new Map<string, RegisteredResource>();
  private templates = new Map<string, ResourceTemplateRow>();

  constructor(private readonly storage: StorageAdapter) {}

  async load(): Promise<void> {
    this.byCanonical.clear();
    this.templates.clear();
    for (const r of await this.storage.resources.list()) {
      this.byCanonical.set(r.canonicalName, toCap(r));
    }
    for (const t of await this.storage.resources.listTemplates()) {
      this.templates.set(t.id, t);
    }
  }

  async registerServerResources(serverName: string, resources: DiscoveredResource[]): Promise<void> {
    await this.storage.resources.replaceServerResources(serverName, resources);
    for (const [k, v] of this.byCanonical) if (v.serverName === serverName) this.byCanonical.delete(k);
    const fresh = await this.storage.resources.listByServer(serverName);
    for (const r of fresh) this.byCanonical.set(r.canonicalName, toCap(r));
  }

  async registerServerTemplates(serverName: string, templates: DiscoveredResourceTemplate[]): Promise<void> {
    await this.storage.resources.replaceServerTemplates(serverName, templates);
    for (const [k, v] of this.templates) if (v.serverName === serverName) this.templates.delete(k);
    const fresh = await this.storage.resources.listTemplatesByServer(serverName);
    for (const t of fresh) this.templates.set(t.id, t);
  }

  async deregister(serverName: string): Promise<void> {
    await this.storage.resources.replaceServerResources(serverName, []);
    await this.storage.resources.replaceServerTemplates(serverName, []);
    for (const [k, v] of this.byCanonical) if (v.serverName === serverName) this.byCanonical.delete(k);
    for (const [k, v] of this.templates) if (v.serverName === serverName) this.templates.delete(k);
  }

  list(): RegisteredResource[] { return Array.from(this.byCanonical.values()); }
  listForServer(serverName: string): RegisteredResource[] {
    return this.list().filter((c) => c.serverName === serverName);
  }
  get(canonical: string): RegisteredResource | undefined { return this.byCanonical.get(canonical); }
  listTemplates(): ResourceTemplateRow[] { return Array.from(this.templates.values()); }

  async setEnabled(canonical: string, enabled: boolean): Promise<void> {
    await this.storage.resources.setEnabled(canonical, enabled);
    const cap = this.byCanonical.get(canonical);
    if (cap) cap.enabled = enabled;
  }

  async setSensitive(canonical: string, sensitive: boolean): Promise<void> {
    await this.storage.resources.setSensitive(canonical, sensitive);
    const cap = this.byCanonical.get(canonical);
    if (cap) cap.sensitive = sensitive;
  }
}
