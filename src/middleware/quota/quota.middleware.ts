import type { MiddlewareHandler } from 'hono';
import type { QuotaService } from '../../quota/index.js';
import { quotaExceeded } from '../monitoring/metrics.middleware.js';

export function quotaMiddleware(opts: { quota: QuotaService }): MiddlewareHandler {
  return async (c, next) => {
    const principal = c.get('principal');
    if (!principal) return next();

    const ctype = c.req.header('content-type') ?? '';
    let isToolCall = false;
    if (ctype.includes('application/json')) {
      try {
        const body = await c.req.raw.clone().json() as { method?: string };
        isToolCall = body.method === 'tools/call';
      } catch { /* ignore */ }
    }
    if (!isToolCall) return next();

    const d = await opts.quota.checkAndIncrement({
      principalType: principal.type, principalId: principal.id,
    });
    if (!d.allowed) {
      quotaExceeded.inc({ principal_type: principal.type, period: d.period ?? 'unknown' });
      c.header('X-Quota-Reset', String(Math.ceil(d.resetAtMs / 1000)));
      c.header('X-Quota-Used', String(d.used));
      c.header('X-Quota-Limit', String(d.limit));
      return c.json({
        error: { code: 'quota_exceeded', period: d.period, message: 'Quota exhausted' },
      }, 429);
    }
    return next();
  };
}
