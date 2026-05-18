import type { MiddlewareHandler } from 'hono';
import type { RateLimiter } from '../../ratelimit/index.js';
import { rateLimitHits } from '../monitoring/metrics.middleware.js';

export interface RateLimitMiddlewareOptions {
  rateLimiter: RateLimiter;
}

export function rateLimitMiddleware(opts: RateLimitMiddlewareOptions): MiddlewareHandler {
  return async (c, next) => {
    const principal = c.get('principal');
    if (!principal) return next();

    // Only enforce on tools/call; other RPC methods bypass.
    const ctype = c.req.header('content-type') ?? '';
    let toolName: string | undefined;
    if (ctype.includes('application/json')) {
      try {
        const body = await c.req.raw.clone().json() as { method?: string; params?: { name?: string } };
        if (body.method === 'tools/call') toolName = body.params?.name;
      } catch { /* ignore */ }
    }

    if (toolName === undefined) return next();

    const decision = await opts.rateLimiter.check({
      principalType: principal.type,
      principalId: principal.id,
      tool: toolName,
    });

    if (!decision.allowed) {
      rateLimitHits.inc({ principal_type: principal.type, rule: decision.rule ? 'matched' : 'default' });
      const retryAfter = Math.max(1, Math.ceil((decision.resetAtMs - Date.now()) / 1000));
      c.header('Retry-After', String(retryAfter));
      c.header('X-RateLimit-Remaining', '0');
      c.header('X-RateLimit-Reset', String(Math.ceil(decision.resetAtMs / 1000)));
      return c.json({ error: { code: 'rate_limit_exceeded', message: 'Too many requests' } }, 429);
    }
    c.header('X-RateLimit-Remaining', String(decision.remaining));
    c.header('X-RateLimit-Reset', String(Math.ceil(decision.resetAtMs / 1000)));
    return next();
  };
}
