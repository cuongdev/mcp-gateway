import type { MiddlewareHandler } from 'hono';
import type { ToolCache } from '../../cache/interface.js';
import type { ToolRegistry } from '../../registry/tool.registry.js';
import { cacheKey } from '../../cache/key.js';
import { cacheHits, cacheMisses } from '../monitoring/metrics.middleware.js';

export interface CacheMiddlewareOptions {
  cache: ToolCache;
  toolRegistry: ToolRegistry;
  defaultTtlSec: number;
}

export function cacheMiddleware(opts: CacheMiddlewareOptions): MiddlewareHandler {
  return async (c, next) => {
    const ctype = c.req.header('content-type') ?? '';
    if (!ctype.includes('application/json')) return next();

    let body: { method?: string; id?: unknown; params?: { name?: string; arguments?: unknown } };
    try {
      body = (await c.req.raw.clone().json()) as typeof body;
    } catch {
      return next();
    }

    if (body.method !== 'tools/call' || typeof body.params?.name !== 'string') return next();

    const tool = opts.toolRegistry.get(body.params.name);
    if (!tool || !tool.cacheable) return next();

    const principal = c.get('principal');
    const principalScopedId = tool.cachePerPrincipal && principal ? principal.id : undefined;
    const key = cacheKey(body.params.name, body.params.arguments ?? {}, principalScopedId);

    const hit = await opts.cache.get(key);
    if (hit) {
      cacheHits.inc({ tool: body.params.name });
      return new Response(hit.body, {
        status: 200,
        headers: { 'content-type': hit.contentType, 'x-mcp-cache': 'hit' },
      });
    }
    cacheMisses.inc({ tool: body.params.name });

    await next();
    const res = c.res;
    if (!res || res.status !== 200) return;
    const upstreamCt = res.headers.get('content-type') ?? 'application/json';
    if (!upstreamCt.includes('json')) return;
    const cloned = res.clone();
    const text = await cloned.text();
    const ttl = tool.cacheTtlSec ?? opts.defaultTtlSec;
    await opts.cache.set(key, { body: text, contentType: upstreamCt }, ttl, {
      tool: body.params.name,
      principalId: principalScopedId,
    });
    c.res.headers.set('x-mcp-cache', 'miss');
  };
}
