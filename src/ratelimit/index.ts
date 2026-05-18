import type { Rule } from './rules.js';
import { matchRule, parseLimit } from './rules.js';
import { MemoryRateLimitBackend } from './memory.backend.js';
import type { GatewayConfig } from '../config/schema.js';

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetAtMs: number;
  rule: Rule | null;
}

export interface RateLimitBackend {
  check(key: string, count: number, windowSec: number): Promise<RateLimitDecision>;
  shutdown?(): Promise<void>;
}

export interface RateLimiterOptions {
  rules: Rule[];
  defaultLimit: string;
  backend: RateLimitBackend;
}

export async function createRateLimiter(cfg: GatewayConfig['rateLimit']): Promise<RateLimiter> {
  let backend: RateLimitBackend;
  if (cfg.backend === 'redis') {
    if (!cfg.redisUrl) throw new Error('rateLimit.backend=redis requires rateLimit.redisUrl');
    const { RedisRateLimitBackend } = await import('./redis.backend.js');
    backend = new RedisRateLimitBackend(cfg.redisUrl);
  } else {
    backend = new MemoryRateLimitBackend();
  }
  return new RateLimiter({ rules: cfg.rules, defaultLimit: cfg.default, backend });
}

export class RateLimiter {
  constructor(private readonly opts: RateLimiterOptions) {}

  async check(ctx: { principalType: string; principalId: string; tool?: string }): Promise<RateLimitDecision> {
    const rule = matchRule(this.opts.rules, ctx);
    const limitStr = rule?.limit ?? this.opts.defaultLimit;
    const parsed = parseLimit(limitStr);
    const key = `rl:${rule ? this.opts.rules.indexOf(rule) : 'default'}:${ctx.principalId}:${ctx.tool ?? '*'}`;
    const decision = await this.opts.backend.check(key, parsed.count, parsed.windowSec);
    return { ...decision, rule };
  }

  async shutdown(): Promise<void> {
    if (this.opts.backend.shutdown) await this.opts.backend.shutdown();
  }
}
