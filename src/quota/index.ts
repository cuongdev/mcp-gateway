import type { StorageAdapter } from '../storage/adapter.js';
import { dayScope, monthScope, nextDayResetMs, nextMonthResetMs } from './periods.js';

export interface QuotaConfig {
  enabled: boolean;
  default: { daily?: number; monthly?: number };
  overrides: Array<{
    principalType?: 'user' | 'service_account' | 'mcp_client';
    principalId?: string;
    daily?: number;
    monthly?: number;
  }>;
}

export interface QuotaDecision {
  allowed: boolean;
  period: 'daily' | 'monthly' | null;
  used: number;
  limit: number;
  resetAtMs: number;
}

function resolveLimits(
  ctx: { principalType: string; principalId: string },
  cfg: QuotaConfig,
): { daily?: number; monthly?: number } {
  let daily = cfg.default.daily;
  let monthly = cfg.default.monthly;
  let bestScore = -1;
  for (const o of cfg.overrides) {
    let score = 0;
    if (o.principalId === ctx.principalId) score += 4;
    else if (o.principalId) continue;
    if (o.principalType === ctx.principalType) score += 1;
    else if (o.principalType) continue;
    if (score > bestScore) {
      bestScore = score;
      if (o.daily !== undefined) daily = o.daily;
      if (o.monthly !== undefined) monthly = o.monthly;
    }
  }
  return { daily, monthly };
}

export class QuotaService {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly cfg: QuotaConfig,
  ) {}

  async checkAndIncrement(
    ctx: { principalType: string; principalId: string },
    now: Date = new Date(),
  ): Promise<QuotaDecision> {
    if (!this.cfg.enabled) {
      return { allowed: true, period: null, used: 0, limit: Number.POSITIVE_INFINITY, resetAtMs: 0 };
    }
    const limits = resolveLimits(ctx, this.cfg);
    const dScope = dayScope(now);
    const mScope = monthScope(now);
    const currentDaily = await this.storage.usage.get(ctx.principalId, dScope);
    const currentMonthly = await this.storage.usage.get(ctx.principalId, mScope);

    if (limits.daily !== undefined && currentDaily >= limits.daily) {
      return {
        allowed: false, period: 'daily',
        used: currentDaily, limit: limits.daily,
        resetAtMs: nextDayResetMs(now),
      };
    }
    if (limits.monthly !== undefined && currentMonthly >= limits.monthly) {
      return {
        allowed: false, period: 'monthly',
        used: currentMonthly, limit: limits.monthly,
        resetAtMs: nextMonthResetMs(now),
      };
    }

    await this.storage.usage.increment(ctx.principalId, dScope, 1);
    await this.storage.usage.increment(ctx.principalId, mScope, 1);
    return {
      allowed: true, period: null,
      used: currentDaily + 1, limit: limits.daily ?? Number.POSITIVE_INFINITY,
      resetAtMs: nextDayResetMs(now),
    };
  }

  async getStatus(principalId: string, principalType: string, now: Date = new Date()) {
    const limits = resolveLimits({ principalType, principalId }, this.cfg);
    return {
      daily: { used: await this.storage.usage.get(principalId, dayScope(now)), limit: limits.daily },
      monthly: { used: await this.storage.usage.get(principalId, monthScope(now)), limit: limits.monthly },
    };
  }
}
