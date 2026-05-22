// Engine factory — builds a RedactionEngine for a tenant from DB-stored rules
// plus built-in postFilters (e.g. Luhn) which can't survive the DB roundtrip.

import type { StorageAdapter } from '../storage/adapter.js';
import { RedactionEngine, compileRules } from './engine.js';
import type { RawRule } from './types.js';
import { BUILTIN_RULES } from './builtin-rules.js';

const POST_FILTERS: Record<string, (m: string) => boolean> = (() => {
  const map: Record<string, (m: string) => boolean> = {};
  for (const r of BUILTIN_RULES) {
    if (r.postFilter) map[r.id] = r.postFilter;
  }
  return map;
})();

export interface EngineCacheEntry {
  engine: RedactionEngine;
  loadedAt: number;
  ruleCount: number;
}

/**
 * Builds + caches a RedactionEngine per tenant. Engines are rebuilt when
 * `refresh()` is called (e.g. after rule mutation via admin routes).
 */
export class RedactionEngineFactory {
  private readonly cache = new Map<string, EngineCacheEntry>();

  constructor(private readonly storage: StorageAdapter) {}

  async getEngine(tenantId: string = 'tnt_default'): Promise<RedactionEngine> {
    const cached = this.cache.get(tenantId);
    if (cached) return cached.engine;
    return this.refresh(tenantId);
  }

  async refresh(tenantId: string = 'tnt_default'): Promise<RedactionEngine> {
    const rows = await this.storage.redactionRules.list({ tenantId, enabled: true });
    const raw: RawRule[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      pattern: r.pattern,
      mode: r.mode,
      replacement: r.replacement ?? undefined,
      scopeRequest: r.scopeRequest,
      scopeResponse: r.scopeResponse,
      enabled: r.enabled,
      postFilter: r.builtIn ? POST_FILTERS[r.id] : undefined,
    }));
    const compiled = compileRules(raw);
    const engine = new RedactionEngine(compiled);
    this.cache.set(tenantId, { engine, loadedAt: Date.now(), ruleCount: compiled.length });
    return engine;
  }

  invalidate(tenantId?: string): void {
    if (tenantId) this.cache.delete(tenantId);
    else this.cache.clear();
  }
}
