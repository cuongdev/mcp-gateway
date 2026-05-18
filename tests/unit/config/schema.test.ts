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
});
