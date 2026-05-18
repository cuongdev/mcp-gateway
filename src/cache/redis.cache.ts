import { Redis } from 'ioredis';
import type { ToolCache, CachedValue } from './interface.js';

export class RedisToolCache implements ToolCache {
  private readonly client: Redis;
  constructor(url: string) {
    this.client = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: false });
  }

  async get(key: string): Promise<CachedValue | null> {
    const s = await this.client.get(`cache:entry:${key}`);
    return s ? JSON.parse(s) : null;
  }

  async set(
    key: string, value: CachedValue, ttlSec: number,
    ctx: { tool: string; principalId?: string },
  ): Promise<void> {
    const pipeline = this.client.multi();
    pipeline.set(`cache:entry:${key}`, JSON.stringify(value), 'EX', ttlSec);
    pipeline.sadd(`cache:tool:${ctx.tool}`, key);
    pipeline.expire(`cache:tool:${ctx.tool}`, ttlSec + 60);
    if (ctx.principalId) {
      pipeline.sadd(`cache:principal:${ctx.principalId}`, key);
      pipeline.expire(`cache:principal:${ctx.principalId}`, ttlSec + 60);
    }
    await pipeline.exec();
  }

  async invalidateTool(tool: string): Promise<number> {
    const setKey = `cache:tool:${tool}`;
    const keys = await this.client.smembers(setKey);
    if (keys.length === 0) return 0;
    const pipeline = this.client.multi();
    for (const k of keys) pipeline.del(`cache:entry:${k}`);
    pipeline.del(setKey);
    await pipeline.exec();
    return keys.length;
  }

  async invalidatePrincipal(principalId: string): Promise<number> {
    const setKey = `cache:principal:${principalId}`;
    const keys = await this.client.smembers(setKey);
    if (keys.length === 0) return 0;
    const pipeline = this.client.multi();
    for (const k of keys) pipeline.del(`cache:entry:${k}`);
    pipeline.del(setKey);
    await pipeline.exec();
    return keys.length;
  }

  async shutdown(): Promise<void> {
    await this.client.quit();
  }
}
