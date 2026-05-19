import type { GatewayConfig } from './schema.js';
import { redactProxyUrl } from '../proxy/redact.js';

const MASK = '***';

function redactRedisUrl(url: string | null): string | null {
  if (!url) return url;
  return redactProxyUrl(url); // same userinfo regex
}

/**
 * Deep-clones the given GatewayConfig and replaces secret fields with
 * `***` so the result is safe to expose via GET /api/system/info.
 *
 * Fields redacted:
 *  - oidcProviders[].clientSecret
 *  - auth.sessionCookieSecret
 *  - session.secret
 *  - storage.authToken
 *  - approval.tokenSecret
 *  - cache.redisUrl password
 *  - rateLimit.redisUrl password
 *  - servers[].transport.bearerToken           (HTTP/SSE)
 *  - servers[].transport.auth.token            (OpenAPI)
 */
export function redactConfig(cfg: GatewayConfig): GatewayConfig {
  const clone: GatewayConfig = JSON.parse(JSON.stringify(cfg));

  for (const p of clone.oidcProviders ?? []) {
    if (p.clientSecret) p.clientSecret = MASK;
  }
  if (clone.auth?.sessionCookieSecret) clone.auth.sessionCookieSecret = MASK;
  if (clone.session?.secret) clone.session.secret = MASK;
  if (clone.storage?.authToken) clone.storage.authToken = MASK;
  if (clone.approval?.tokenSecret) clone.approval.tokenSecret = MASK;
  if (clone.cache?.redisUrl) clone.cache.redisUrl = redactRedisUrl(clone.cache.redisUrl);
  if (clone.rateLimit?.redisUrl) clone.rateLimit.redisUrl = redactRedisUrl(clone.rateLimit.redisUrl);

  for (const s of clone.servers ?? []) {
    const t = s.transport;
    if (t.type === 'streamable-http' || t.type === 'sse') {
      if (t.bearerToken) t.bearerToken = MASK;
    } else if (t.type === 'openapi') {
      if (t.auth?.token) t.auth.token = MASK;
    }
  }

  return clone;
}
