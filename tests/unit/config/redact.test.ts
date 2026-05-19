import { describe, it, expect } from 'vitest';
import { redactConfig } from '../../../src/config/redact.js';
import type { GatewayConfig } from '../../../src/config/schema.js';

function baseConfig(): GatewayConfig {
  // Minimal valid-shape stub; redactor must not throw on missing optionals.
  return {
    mode: 'development',
    gateway: { port: 3000, host: '0.0.0.0', mcpPath: '/mcp', apiPath: '/api', corsOrigins: ['*'], requestTimeout: 30000 },
    oidcProviders: [
      { id: 'google', name: 'Google', discoveryUrl: 'https://x/.well-known', clientId: 'c', clientSecret: 'SECRET-1', scopes: [], rolesClaim: 'roles', orgClaim: 'org_id', roleMappings: {} },
    ],
    session: { secret: 'SECRET-0-thirtytwo-characters-long-z', cookieName: 'mcp_session', ttl: 28800, secure: false, sameSite: 'lax', idleTimeoutSec: 600 },
    authorization: { enabled: true, modelFile: '', policyFile: '', defaultDecision: 'deny', cache: { enabled: true, ttl: 600 } },
    servers: [
      { name: 'a', transport: { type: 'streamable-http', url: 'http://x', bearerToken: 'UPSTREAM-1', timeout: 30000, session_mode: 'stateful', headers: {} }, autoDiscover: true, retry: { maxRetries: 3, backoffMs: 1000 }, healthCheck: { enabled: true, intervalMs: 30000 } },
      { name: 'b', transport: { type: 'openapi', specUrl: 'https://x/openapi.json', auth: { type: 'bearer', token: 'UPSTREAM-2' } }, autoDiscover: false, retry: { maxRetries: 3, backoffMs: 1000 }, healthCheck: { enabled: true, intervalMs: 30000 } },
    ], groups: [],
    audit: { enabled: true, storage: 'file', logPath: '', maxFileSize: 1, retentionDays: 1, fileExport: false, fileExportPath: '' },
    monitoring: { metricsEnabled: true, metricsPort: 9090, metricsPath: '/metrics', healthCheckPath: '/health' },
    storage: { driver: 'sqlite', path: './data/x.sqlite', url: null, authToken: 'TOKEN-2' },
    auth: { bearerTokenHeader: 'Authorization', sessionCookieSecret: 'SECRET-3-thirtytwo-characters-long-x', sessionCookieName: 'mcp_session', requireAuthForApi: false, requireAuthForMcp: false },
    rateLimit: { enabled: false, backend: 'memory', redisUrl: 'redis://user:SECRET-4@host:6379', default: '1000/min', rules: [] },
    quota: { enabled: false, default: { daily: 1000, monthly: 1000 }, overrides: [] },
    cache: { enabled: false, backend: 'memory', redisUrl: 'redis://user:SECRET-5@host:6379', maxEntries: 1, defaultTtlSec: 60 },
    approval: { enabled: false, defaultTtlSec: 300, approverRoles: ['admin'], tokenSecret: 'SECRET-6-thirtytwo-characters-long-y' },
    webhooks: { enabled: true, workerPollIntervalMs: 1000, workerConcurrency: 1, maxAttempts: 1, backoffMs: [1000] },
    tracing: { enabled: false, serviceName: 'mcp', otlpEndpoint: null, samplingRatio: 0.1 },
    openapi: { enabled: true, allowedDomains: [], blockPrivateIps: true, maxResponseBytes: 1 },
    proxy: { defaultName: null },
    tenancy: { enabled: false, headerName: 'X-Tenant', defaultSlug: 'default', suspendedHttpStatus: 402 },
  } as unknown as GatewayConfig;
}

describe('redactConfig', () => {
  it('strips OIDC clientSecret', () => {
    const c = redactConfig(baseConfig());
    expect(c.oidcProviders[0].clientSecret).toBe('***');
  });

  it('strips session/auth/storage/approval secrets', () => {
    const c = redactConfig(baseConfig());
    expect(c.session.secret).toBe('***');
    expect(c.auth.sessionCookieSecret).toBe('***');
    expect(c.storage.authToken).toBe('***');
    expect(c.approval.tokenSecret).toBe('***');
  });

  it('redacts redis URL passwords', () => {
    const c = redactConfig(baseConfig());
    expect(c.cache.redisUrl).toBe('redis://user:***@host:6379');
    expect(c.rateLimit.redisUrl).toBe('redis://user:***@host:6379');
  });

  it('redacts upstream server credentials (bearerToken + openapi auth.token)', () => {
    const c = redactConfig(baseConfig());
    const http = c.servers[0].transport as { type: string; bearerToken?: string };
    const oa = c.servers[1].transport as { type: string; auth?: { token?: string } };
    expect(http.bearerToken).toBe('***');
    expect(oa.auth?.token).toBe('***');
  });

  it('does not mutate the input config', () => {
    const input = baseConfig();
    const before = JSON.stringify(input);
    redactConfig(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('passes through nulls and undefineds without throwing', () => {
    const c = baseConfig();
    c.cache.redisUrl = null;
    c.storage.authToken = null;
    expect(() => redactConfig(c)).not.toThrow();
  });
});
