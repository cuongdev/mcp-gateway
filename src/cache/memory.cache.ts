import type { ToolCache, CachedValue } from './interface.js';

interface Entry {
  value: CachedValue;
  expiresAt: number;
  tool: string;
  principalId?: string;
}

export class MemoryToolCache implements ToolCache {
  private readonly entries = new Map<string, Entry>();
  constructor(private readonly maxEntries = 10000) {}

  async get(key: string): Promise<CachedValue | null> {
    const e = this.entries.get(key);
    if (!e) return null;
    if (e.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return e.value;
  }

  async set(
    key: string, value: CachedValue, ttlSec: number,
    ctx: { tool: string; principalId?: string },
  ): Promise<void> {
    this.entries.set(key, {
      value, expiresAt: Date.now() + ttlSec * 1000,
      tool: ctx.tool, principalId: ctx.principalId,
    });
    while (this.entries.size > this.maxEntries) {
      const firstKey = this.entries.keys().next().value;
      if (firstKey !== undefined) this.entries.delete(firstKey);
    }
  }

  async invalidateTool(tool: string): Promise<number> {
    let n = 0;
    for (const [k, e] of this.entries) {
      if (e.tool === tool) { this.entries.delete(k); n++; }
    }
    return n;
  }

  async invalidatePrincipal(principalId: string): Promise<number> {
    let n = 0;
    for (const [k, e] of this.entries) {
      if (e.principalId === principalId) { this.entries.delete(k); n++; }
    }
    return n;
  }
}
