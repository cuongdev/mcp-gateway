import { describe, it, expect } from 'vitest';
import { GatewayConfigSchema } from '../../../src/config/schema.js';

describe('GatewayConfigSchema (P0 additions)', () => {
  it('defaults storage to sqlite at ./data/mcp.sqlite', () => {
    const cfg = GatewayConfigSchema.parse({
      mode: 'development',
      gateway: { port: 3000, host: '0.0.0.0', mcpPath: '/mcp', apiPath: '/api' },
    });
    expect(cfg.storage.driver).toBe('sqlite');
    expect(cfg.storage.path).toBe('./data/mcp.sqlite');
  });

  it('defaults auth.requireAuthForApi/Mcp based on mode', () => {
    const dev = GatewayConfigSchema.parse({
      mode: 'development',
      gateway: { port: 3000, host: '0', mcpPath: '/mcp', apiPath: '/api' },
    });
    expect(dev.auth.requireAuthForApi).toBe(false);
    expect(dev.auth.requireAuthForMcp).toBe(false);
  });

  it('audit.fileExport accepted as optional', () => {
    const cfg = GatewayConfigSchema.parse({
      mode: 'development',
      gateway: { port: 3000, host: '0', mcpPath: '/mcp', apiPath: '/api' },
      audit: { enabled: true, fileExport: true, fileExportPath: './logs/audit.jsonl' },
    });
    expect(cfg.audit.fileExport).toBe(true);
  });

  it('accepts ":memory:" path for storage', () => {
    const cfg = GatewayConfigSchema.parse({
      mode: 'development',
      gateway: { port: 3000, host: '0', mcpPath: '/mcp', apiPath: '/api' },
      storage: { driver: 'sqlite', path: ':memory:' },
    });
    expect(cfg.storage.path).toBe(':memory:');
  });

  it('P2: requires auth.sessionCookieSecret when oidcProviders are configured', () => {
    const result = GatewayConfigSchema.safeParse({
      mode: 'enterprise',
      gateway: { port: 3000, host: '0.0.0.0', mcpPath: '/mcp', apiPath: '/api' },
      oidcProviders: [
        {
          id: 'google',
          name: 'Google',
          discoveryUrl: 'https://accounts.google.com/.well-known/openid-configuration',
          clientId: 'cid',
          clientSecret: 'csecret',
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues;
      expect(
        issues.some(
          (i) =>
            i.path.join('.') === 'auth.sessionCookieSecret' &&
            i.message.includes('sessionCookieSecret is required'),
        ),
      ).toBe(true);
    }
  });

  it('P2: passes when both oidcProviders and auth.sessionCookieSecret are set', () => {
    const cfg = GatewayConfigSchema.parse({
      mode: 'enterprise',
      gateway: { port: 3000, host: '0.0.0.0', mcpPath: '/mcp', apiPath: '/api' },
      oidcProviders: [
        {
          id: 'google',
          name: 'Google',
          discoveryUrl: 'https://accounts.google.com/.well-known/openid-configuration',
          clientId: 'cid',
          clientSecret: 'csecret',
        },
      ],
      auth: {
        sessionCookieSecret: 'a'.repeat(32),
      },
    });
    expect(cfg.oidcProviders).toHaveLength(1);
    expect(cfg.auth.sessionCookieSecret).toBe('a'.repeat(32));
  });
});
