import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { makeStorage } from '../fixtures/helpers/make-storage.js';
import { ToolRegistry } from '../../src/registry/tool.registry.js';
import { ToolGroupManager } from '../../src/registry/tool.groups.js';
import { PromptRegistry } from '../../src/registry/prompt.registry.js';
import { SessionManager } from '../../src/session/session.manager.js';
import { createAdminRoutes } from '../../src/routes/admin.routes.js';
import { initializeEnforcer, addRoleForUser } from '../../src/middleware/authz/policy.engine.js';
import { newId } from '../../src/utils/uuid.js';
import { hashSecret } from '../../src/utils/crypto.js';
import { generateToken, computePrefix } from '../../src/identity/token.js';
import { bearerTokenMiddleware } from '../../src/middleware/auth/bearer-token.middleware.js';
import type { GatewayConfig } from '../../src/config/schema.js';

async function setup() {
  const storage = await makeStorage();
  const id = newId();
  await storage.principals.createServiceAccount({ id, displayName: 'a' });
  const raw = generateToken('sat', 'live');
  await storage.tokens.create({
    id: newId(), principalId: id, prefix: computePrefix(raw), hash: await hashSecret(raw),
  });
  await initializeEnforcer({
    enabled: true,
    modelFile: './config/policy.model.conf',
    policyFile: './config/policy.csv',
    defaultDecision: 'deny',
    cache: { enabled: true, ttl: 600 },
  });
  await addRoleForUser(id, 'admin');
  const registry = new ToolRegistry(storage);
  const app = new Hono();
  const config = {
    mode: 'development',
    gateway: { port: 3000, host: '0.0.0.0', mcpPath: '/mcp', apiPath: '/api', corsOrigins: ['*'], requestTimeout: 30000 },
    oidcProviders: [{ id: 'g', name: 'G', discoveryUrl: 'https://x/.well-known', clientId: 'cid', clientSecret: 'SUPER-SECRET', scopes: [], rolesClaim: 'roles', orgClaim: 'org_id', roleMappings: {} }],
    session: { cookieName: 'mcp_session', ttl: 28800, secure: false, sameSite: 'lax', idleTimeoutSec: 600 },
    authorization: { enabled: true, modelFile: './config/policy.model.conf', policyFile: './config/policy.csv', defaultDecision: 'deny', cache: { enabled: true, ttl: 600 } },
    servers: [], groups: [],
    audit: { enabled: true, storage: 'file', logPath: '', maxFileSize: 1, retentionDays: 1, fileExport: false, fileExportPath: '' },
    monitoring: { metricsEnabled: true, metricsPort: 9090, metricsPath: '/metrics', healthCheckPath: '/health' },
    storage: { driver: 'sqlite', path: './x.sqlite', url: null, authToken: 'TOKEN-VALUE' },
    auth: { bearerTokenHeader: 'Authorization', sessionCookieSecret: 'thirtytwoCharsLongSessionSecretXX', sessionCookieName: 'mcp_session', requireAuthForApi: true, requireAuthForMcp: true },
    rateLimit: { enabled: false, backend: 'memory', redisUrl: null, default: '1000/min', rules: [] },
    quota: { enabled: false, default: { daily: 1000, monthly: 1000 }, overrides: [] },
    cache: { enabled: false, backend: 'memory', redisUrl: null, maxEntries: 1, defaultTtlSec: 60 },
    approval: { enabled: false, defaultTtlSec: 300, approverRoles: ['admin'], tokenSecret: 'thirtytwoCharsLongApprovalToken!!' },
    webhooks: { enabled: true, workerPollIntervalMs: 1000, workerConcurrency: 1, maxAttempts: 1, backoffMs: [1000] },
    tracing: { enabled: false, serviceName: 'mcp', otlpEndpoint: null, samplingRatio: 0.1 },
    openapi: { enabled: true, allowedDomains: [], blockPrivateIps: true, maxResponseBytes: 1 },
    proxy: { defaultName: null },
    tenancy: { enabled: false, headerName: 'X-Tenant', defaultSlug: 'default', suspendedHttpStatus: 402 },
  } as unknown as GatewayConfig;
  app.use('*', bearerTokenMiddleware({ storage }));
  app.route('/api', createAdminRoutes({
    config, storage, toolRegistry: registry,
    toolGroups: new ToolGroupManager(storage, registry),
    sessionManager: new SessionManager(),
    promptRegistry: new PromptRegistry(storage),
  }));
  return { app, storage, token: raw };
}

describe('GET /api/system/info', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { env = await setup(); });
  afterEach(async () => { await env.storage.close(); });

  it('returns redacted config', async () => {
    const r = await env.app.request('/api/system/info', {
      headers: { Authorization: `Bearer ${env.token}` },
    });
    expect(r.status).toBe(200);
    const body = await r.json() as { config: { oidcProviders: Array<{ clientSecret: string }>; storage: { authToken: string }; auth: { sessionCookieSecret: string } } };
    expect(body.config.oidcProviders[0].clientSecret).toBe('***');
    expect(body.config.storage.authToken).toBe('***');
    expect(body.config.auth.sessionCookieSecret).toBe('***');
  });

  it('requires authentication', async () => {
    const r = await env.app.request('/api/system/info');
    expect(r.status).toBe(401);
  });
});
