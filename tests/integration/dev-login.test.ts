import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { makeStorage } from '../fixtures/helpers/make-storage.js';
import { createAuthRoutes } from '../../src/routes/auth.routes.js';
import { sessionCookieMiddleware } from '../../src/middleware/auth/session-cookie.middleware.js';
import { GatewayConfigSchema, type GatewayConfig } from '../../src/config/schema.js';

async function setup(mode: 'development' | 'enterprise') {
  const storage = await makeStorage();
  const config: GatewayConfig = GatewayConfigSchema.parse({
    mode,
    gateway: { port: 3001, host: '127.0.0.1' },
    auth: { sessionCookieSecret: 'thirtytwoCharsLongSessionSecretXX' },
  });
  const app = new Hono();
  app.use('*', sessionCookieMiddleware({ storage, config }));
  app.route('/auth', createAuthRoutes(config, { storage }));
  return { app, storage };
}

describe('POST /auth/dev-login', () => {
  it('issues session cookie in development mode', async () => {
    const env = await setup('development');
    try {
      const r = await env.app.request('/auth/dev-login', { method: 'POST' });
      expect(r.status).toBe(200);
      expect(r.headers.get('set-cookie')).toContain('mcp_session=');
      const body = await r.json() as { principalId: string; displayName: string };
      expect(body.displayName).toBe('Developer');
    } finally {
      await env.storage.close();
    }
  });

  it('returns 404 in enterprise mode', async () => {
    const env = await setup('enterprise');
    try {
      const r = await env.app.request('/auth/dev-login', { method: 'POST' });
      expect(r.status).toBe(404);
    } finally {
      await env.storage.close();
    }
  });
});
