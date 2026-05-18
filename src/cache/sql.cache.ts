import type { StorageAdapter } from '../storage/adapter.js';
import type { ToolCache, CachedValue } from './interface.js';

export class SqlToolCache implements ToolCache {
  constructor(private readonly storage: StorageAdapter) {}

  async get(key: string): Promise<CachedValue | null> {
    const row = await this.storage.cache.get(key);
    if (!row) return null;
    return JSON.parse(row.value);
  }

  async set(
    key: string, value: CachedValue, ttlSec: number,
    ctx: { tool: string; principalId?: string },
  ): Promise<void> {
    await this.storage.cache.set(key, {
      tool: ctx.tool, value: JSON.stringify(value),
      expiresAt: Date.now() + ttlSec * 1000,
      principalId: ctx.principalId,
    });
  }

  async invalidateTool(tool: string): Promise<number> {
    return this.storage.cache.deleteByTool(tool);
  }

  async invalidatePrincipal(principalId: string): Promise<number> {
    return this.storage.cache.deleteByPrincipal(principalId);
  }
}
