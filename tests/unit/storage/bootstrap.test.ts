import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../src/storage/sqlite.adapter.js';
import { bootstrapFromConfig } from '../../../src/storage/bootstrap.js';

const silentLog = { info: () => {}, warn: () => {} };

describe('bootstrapFromConfig', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => { storage = await makeStorage(); });
  afterEach(async () => { await storage.close(); });

  it('upserts streamable-http server', async () => {
    const r = await bootstrapFromConfig(
      storage,
      {
        servers: [{
          name: 'db',
          autoDiscover: false,
          transport: {
            type: 'streamable-http',
            url: 'http://x/mcp',
            timeout: 30000,
            session_mode: 'stateful',
            headers: {},
          },
          retry: { maxRetries: 3, backoffMs: 1000 },
          healthCheck: { enabled: true, intervalMs: 30000 },
        }],
        groups: [],
      } as never,
      silentLog,
    );
    expect(r.serversApplied).toBe(1);
    const s = await storage.servers.findByName('db');
    expect(s).not.toBeNull();
    expect(s?.transportType).toBe('streamable-http');
    expect(s?.transportConfig.url).toBe('http://x/mcp');
    expect(s?.autoDiscover).toBe(false);
  });

  it('upserts stdio server', async () => {
    const r = await bootstrapFromConfig(
      storage,
      {
        servers: [{
          name: 'fs',
          autoDiscover: true,
          transport: {
            type: 'stdio',
            command: 'npx',
            args: ['-y', 'foo'],
            stateful: false,
            idleTimeoutMs: 300000,
          },
          retry: { maxRetries: 3, backoffMs: 1000 },
          healthCheck: { enabled: true, intervalMs: 30000 },
        }],
        groups: [],
      } as never,
      silentLog,
    );
    expect(r.serversApplied).toBe(1);
    const s = await storage.servers.findByName('fs');
    expect(s?.transportType).toBe('stdio');
    expect(s?.transportConfig.command).toBe('npx');
  });

  it('skips openapi transport with serversSkipped counter', async () => {
    const warnings: Array<{ msg: string; extra?: Record<string, unknown> }> = [];
    const captureLog = {
      info: () => {},
      warn: (msg: string, extra?: Record<string, unknown>) => warnings.push({ msg, extra }),
    };
    const r = await bootstrapFromConfig(
      storage,
      {
        servers: [{
          name: 'pets',
          autoDiscover: true,
          transport: { type: 'openapi', specUrl: 'http://x/openapi.json' },
          retry: { maxRetries: 3, backoffMs: 1000 },
          healthCheck: { enabled: true, intervalMs: 30000 },
        }],
        groups: [],
      } as never,
      captureLog,
    );
    expect(r.serversApplied).toBe(0);
    expect(r.serversSkipped).toBe(1);
    expect(await storage.servers.findByName('pets')).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0].extra?.server).toBe('pets');
  });

  it('idempotent: second boot does not error or duplicate', async () => {
    // Pre-discover the tool so FK to tools(canonical_name) is satisfied.
    const cfg = {
      servers: [{
        name: 'db',
        autoDiscover: false,
        transport: {
          type: 'streamable-http',
          url: 'http://x/mcp',
          timeout: 30000,
          session_mode: 'stateful',
          headers: {},
        },
        retry: { maxRetries: 3, backoffMs: 1000 },
        healthCheck: { enabled: true, intervalMs: 30000 },
      }],
      groups: [{ name: 'g', tools: ['db__q'] }],
    } as never;
    // First boot creates the `db` server (so we can register a tool against it).
    await bootstrapFromConfig(storage, cfg, silentLog);
    await storage.tools.replaceServerTools('db', [{
      originalName: 'q', description: '', inputSchema: { type: 'object' },
    }]);
    // Second + third boot: idempotent.
    await bootstrapFromConfig(storage, cfg, silentLog);
    await bootstrapFromConfig(storage, cfg, silentLog);
    const list = await storage.servers.list();
    expect(list.filter((s) => s.name === 'db').length).toBe(1);
    const g = await storage.groups.findByName('g');
    expect(g?.tools).toEqual(['db__q']);
  });

  it('does not delete runtime-registered servers absent from config', async () => {
    await storage.servers.upsert({
      name: 'runtime-only',
      transportType: 'streamable-http',
      transportConfig: { url: 'http://r/mcp' },
    });
    await bootstrapFromConfig(storage, { servers: [], groups: [] } as never, silentLog);
    expect(await storage.servers.findByName('runtime-only')).not.toBeNull();
  });

  it('upserts a group with includedServers + excludedTools', async () => {
    // includedServers is FK-enforced — pre-create the `db` server.
    await storage.servers.upsert({
      name: 'db',
      transportType: 'streamable-http',
      transportConfig: { url: 'http://x/mcp' },
    });
    const r = await bootstrapFromConfig(
      storage,
      {
        servers: [],
        groups: [{
          name: 'analyst',
          description: 'analyst pack',
          tools: [],
          includedServers: ['db'],
          excludedTools: ['db__delete'],
          allowedRoles: ['analyst'],
        }],
      } as never,
      silentLog,
    );
    expect(r.groupsApplied).toBe(1);
    const g = await storage.groups.findByName('analyst');
    expect(g?.includedServers).toEqual(['db']);
    expect(g?.excludedTools).toEqual(['db__delete']);
    expect(g?.allowedRoles).toEqual(['analyst']);
  });

  it('filters unknown tools / includedServers and logs warnings', async () => {
    const warnings: Array<{ msg: string; extra?: Record<string, unknown> }> = [];
    const captureLog = {
      info: () => {},
      warn: (msg: string, extra?: Record<string, unknown>) => warnings.push({ msg, extra }),
    };
    await bootstrapFromConfig(
      storage,
      {
        servers: [],
        groups: [{
          name: 'g',
          tools: ['ghost__tool'],
          includedServers: ['ghost-server'],
        }],
      } as never,
      captureLog,
    );
    const g = await storage.groups.findByName('g');
    expect(g?.tools).toEqual([]);
    expect(g?.includedServers).toEqual([]);
    // Both unknowns should have produced warnings.
    expect(warnings.some((w) => Array.isArray(w.extra?.missing) && (w.extra!.missing as string[]).includes('ghost__tool'))).toBe(true);
    expect(warnings.some((w) => Array.isArray(w.extra?.missing) && (w.extra!.missing as string[]).includes('ghost-server'))).toBe(true);
  });
});
