import type { StorageAdapter } from '../storage/adapter.js';
import type { ToolCache } from './interface.js';
import { MemoryToolCache } from './memory.cache.js';
import { SqlToolCache } from './sql.cache.js';

export interface CacheConfig {
  enabled: boolean;
  backend: 'memory' | 'redis' | 'sql';
  redisUrl: string | null;
  maxEntries: number;
  defaultTtlSec: number;
}

export async function createToolCache(cfg: CacheConfig, storage: StorageAdapter): Promise<ToolCache> {
  if (cfg.backend === 'redis') {
    if (!cfg.redisUrl) throw new Error('cache.backend=redis requires cache.redisUrl');
    const { RedisToolCache } = await import('./redis.cache.js');
    return new RedisToolCache(cfg.redisUrl);
  }
  if (cfg.backend === 'sql') return new SqlToolCache(storage);
  return new MemoryToolCache(cfg.maxEntries);
}

export type { ToolCache, CachedValue } from './interface.js';
