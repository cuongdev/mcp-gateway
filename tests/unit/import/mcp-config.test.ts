import { describe, it, expect } from 'vitest';
import { parseMcpImport } from '../../../src/import/mcp-config.js';

describe('parseMcpImport', () => {
  it('parses Claude Desktop / Cursor "mcpServers" stdio entries', () => {
    const r = parseMcpImport({
      mcpServers: {
        github: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: { GITHUB_TOKEN: 'x' } },
      },
    });
    expect(r.source).toBe('mcpServers');
    expect(r.servers).toHaveLength(1);
    expect(r.servers[0]).toMatchObject({
      name: 'github',
      transport: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: { GITHUB_TOKEN: 'x' } },
    });
  });

  it('parses a Cursor/Antigravity HTTP entry via url', () => {
    const r = parseMcpImport({ mcpServers: { api: { url: 'https://api.example.com/mcp' } } });
    expect(r.servers[0].transport).toEqual({ type: 'streamable-http', url: 'https://api.example.com/mcp' });
  });

  it('detects SSE from a /sse url and from type', () => {
    const r1 = parseMcpImport({ mcpServers: { s: { url: 'https://x.dev/sse' } } });
    expect(r1.servers[0].transport.type).toBe('sse');
    const r2 = parseMcpImport({ mcpServers: { s: { type: 'sse', url: 'https://x.dev/stream' } } });
    expect(r2.servers[0].transport.type).toBe('sse');
  });

  it('parses VS Code "servers" with type + headers', () => {
    const r = parseMcpImport({
      servers: { remote: { type: 'http', url: 'https://x.dev/mcp', headers: { 'X-API-Key': 'abc' } } },
    });
    expect(r.source).toBe('servers');
    expect(r.servers[0].transport).toEqual({ type: 'streamable-http', url: 'https://x.dev/mcp', headers: { 'X-API-Key': 'abc' } });
  });

  it('accepts a bare name→entry map (no wrapper)', () => {
    const r = parseMcpImport({ codegraph: { command: 'codegraph', args: ['serve', '--mcp'] } });
    expect(r.source).toBe('root');
    expect(r.servers[0].name).toBe('codegraph');
  });

  it('handles Antigravity serverUrl alias', () => {
    const r = parseMcpImport({ mcpServers: { ag: { serverUrl: 'https://ag.dev/mcp' } } });
    expect(r.servers[0].transport).toMatchObject({ type: 'streamable-http', url: 'https://ag.dev/mcp' });
  });

  it('warns about unresolved editor variables like ${workspaceFolder}', () => {
    const r = parseMcpImport({
      mcpServers: { cg: { command: 'codegraph', args: ['serve', '--path', '${workspaceFolder}'] } },
    });
    expect(r.servers[0].warnings.join(' ')).toMatch(/workspaceFolder/);
  });

  it('keeps ${UPPER_SNAKE} env placeholders without warning', () => {
    const r = parseMcpImport({ mcpServers: { db: { command: 'srv', args: ['--token', '${DB_TOKEN}'] } } });
    expect(r.servers[0].warnings).toHaveLength(0);
  });

  it('skips disabled entries and entries with no command/url', () => {
    const r = parseMcpImport({
      mcpServers: {
        off: { command: 'x', disabled: true },
        empty: { description: 'nothing' },
        good: { command: 'y' },
      },
    });
    expect(r.servers.map((s) => s.name)).toEqual(['good']);
    expect(r.warnings.join(' ')).toMatch(/disabled/);
    expect(r.warnings.join(' ')).toMatch(/no "command" or "url"/);
  });

  it('accepts a JSON string and reports invalid JSON', () => {
    expect(parseMcpImport('{"mcpServers":{"a":{"command":"x"}}}').servers).toHaveLength(1);
    expect(parseMcpImport('{bad').warnings[0]).toMatch(/Invalid JSON/);
  });

  it('reports when no server map is present', () => {
    expect(parseMcpImport({ foo: 'bar' }).warnings[0]).toMatch(/No "mcpServers"/);
  });
});
