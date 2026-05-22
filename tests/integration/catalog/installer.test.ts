import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeStorage } from '../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../src/storage/sqlite.adapter.js';
import { ConnectorRegistry } from '../../../src/catalog/connectors.js';
import {
  CatalogInstaller,
  buildTransport,
  redactConfigSnapshot,
  compareVersions,
} from '../../../src/catalog/installer.js';
import { SessionManager } from '../../../src/session/session.manager.js';
import { ToolRegistry } from '../../../src/registry/tool.registry.js';
import {
  ConnectorNotFoundError,
  GatewayError,
  InvalidEnvError,
} from '../../../src/types/errors.js';

async function setup(opts?: { autoDiscoverThrows?: boolean }) {
  const storage = await makeStorage();
  const registry = new ConnectorRegistry();
  registry.loadBuiltin();
  const sessionManager = new SessionManager();
  // Stub discoverTools / register / remove to avoid actually spawning a child
  // process. The installer only cares about the success/failure of these calls.
  sessionManager.register = vi.fn();
  sessionManager.remove = vi.fn();
  if (opts?.autoDiscoverThrows) {
    sessionManager.discoverTools = vi.fn().mockRejectedValue(new Error('upstream init failed'));
  } else {
    sessionManager.discoverTools = vi.fn().mockResolvedValue([
      { name: 'create_issue', description: 'Create a GitHub issue', inputSchema: { type: 'object' } },
      { name: 'list_repos', description: 'List repositories', inputSchema: { type: 'object' } },
    ]);
  }
  const toolRegistry = new ToolRegistry(storage);
  const installer = new CatalogInstaller(registry, storage, sessionManager, toolRegistry);
  return { storage, registry, sessionManager, toolRegistry, installer };
}

describe('CatalogInstaller', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  afterEach(async () => { if (env) await env.storage.close(); });

  it('happy path: registers server, discovers tools, writes install row', async () => {
    env = await setup();
    const result = await env.installer.install({
      connectorId: 'github',
      name: 'github',
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_secrettoken' },
      installedBy: 'usr_admin',
    });
    expect(result.server).toBe('github');
    expect(result.capabilitiesDiscovered).toBe(2);
    expect(result.templateVersion).toBe('1.0.0');
    expect(result.id).toMatch(/^inst_/);

    const server = await env.storage.servers.findByName('github');
    expect(server?.transportType).toBe('stdio');
    const install = await env.storage.catalogInstalls.findByServerName('github');
    expect(install?.connectorId).toBe('github');
    const snap = JSON.parse(install!.configSnapshotJson) as { env: Record<string, string> };
    expect(snap.env.GITHUB_PERSONAL_ACCESS_TOKEN).toBe('***');
  });

  it('throws ConnectorNotFoundError when connectorId is unknown', async () => {
    env = await setup();
    await expect(env.installer.install({
      connectorId: 'nope',
      name: 'x',
      env: {},
    })).rejects.toBeInstanceOf(ConnectorNotFoundError);
  });

  it('throws InvalidEnvError when a required env key is missing', async () => {
    env = await setup();
    await expect(env.installer.install({
      connectorId: 'github',
      name: 'github',
      env: {},
    })).rejects.toBeInstanceOf(InvalidEnvError);
  });

  it('throws InvalidEnvError when pattern does not match', async () => {
    env = await setup();
    // Patch a template to add a pattern via the registry (mutate in place).
    const tpl = env.registry.get('github');
    if (tpl) {
      (tpl.requiredEnv[0] as { pattern?: string }).pattern = '^ghp_[A-Za-z0-9]+$';
    }
    await expect(env.installer.install({
      connectorId: 'github',
      name: 'github',
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'WRONG FORMAT' },
    })).rejects.toBeInstanceOf(InvalidEnvError);
    // Restore so other tests are not affected by this mutation.
    if (tpl) delete (tpl.requiredEnv[0] as { pattern?: string }).pattern;
  });

  it('throws conflict when a server with the same name already exists', async () => {
    env = await setup();
    await env.storage.servers.upsert({
      name: 'github',
      transportType: 'stdio',
      transportConfig: { command: 'true', args: [] },
    });
    await expect(env.installer.install({
      connectorId: 'github',
      name: 'github',
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_xx' },
    })).rejects.toBeInstanceOf(GatewayError);
  });

  it('rolls back server + install row when auto-discover fails', async () => {
    env = await setup({ autoDiscoverThrows: true });
    await expect(env.installer.install({
      connectorId: 'github',
      name: 'github',
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_xx' },
    })).rejects.toThrow(/upstream init failed/);
    // Server row should be removed
    expect(await env.storage.servers.findByName('github')).toBeNull();
    // No install row
    expect(await env.storage.catalogInstalls.findByServerName('github')).toBeNull();
    expect(env.sessionManager.remove).toHaveBeenCalledWith('github');
  });

  it('uninstall removes server row + install row', async () => {
    env = await setup();
    await env.installer.install({
      connectorId: 'github',
      name: 'github',
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_xx' },
    });
    await env.installer.uninstall('github');
    expect(await env.storage.servers.findByName('github')).toBeNull();
    expect(await env.storage.catalogInstalls.findByServerName('github')).toBeNull();
    expect(env.sessionManager.remove).toHaveBeenCalledWith('github');
  });

  it('uninstall throws 404 when no install exists', async () => {
    env = await setup();
    await expect(env.installer.uninstall('does-not-exist')).rejects.toThrow();
  });

  it('listInstalls flags updateAvailable when registry version is newer', async () => {
    env = await setup();
    await env.installer.install({
      connectorId: 'github',
      name: 'github',
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_xx' },
    });
    // Bump the registry template version manually.
    const tpl = env.registry.get('github');
    if (tpl) tpl.templateVersion = '2.0.0';
    const installs = await env.installer.listInstalls();
    expect(installs).toHaveLength(1);
    expect(installs[0].updateAvailable).toBe(true);
    expect(installs[0].currentTemplateVersion).toBe('2.0.0');
    expect(installs[0].templateVersion).toBe('1.0.0');
    if (tpl) tpl.templateVersion = '1.0.0';
  });
});

describe('buildTransport', () => {
  it('stdio transport carries through env verbatim', () => {
    const t = buildTransport(
      { kind: 'stdio', command: 'npx', args: ['-y', 'pkg'] },
      { TOKEN: 'secret' },
      {},
    );
    expect(t.type).toBe('stdio');
    if (t.type === 'stdio') {
      expect(t.command).toBe('npx');
      expect(t.args).toEqual(['-y', 'pkg']);
      expect(t.env?.TOKEN).toBe('secret');
    }
  });

  it('streamable-http transport renders {key} placeholders from args then env', () => {
    const t = buildTransport(
      { kind: 'streamable-http', urlTemplate: 'https://{host}/mcp?token={TOKEN}' },
      { TOKEN: 'envvalue' },
      { host: 'example.com' },
    );
    expect(t.type).toBe('streamable-http');
    if (t.type === 'streamable-http') {
      expect(t.url).toBe('https://example.com/mcp?token=envvalue');
    }
  });
});

describe('redactConfigSnapshot', () => {
  it('replaces secret env values with *** and keeps non-secret values', () => {
    const snap = redactConfigSnapshot(
      { type: 'stdio', command: 'npx', args: [], env: { TOKEN: 'real', HOST: 'api.example.com' } },
      [
        { key: 'TOKEN', description: '', secret: true },
        { key: 'HOST', description: '', secret: false },
      ],
    );
    expect((snap as { env: Record<string, string> }).env.TOKEN).toBe('***');
    expect((snap as { env: Record<string, string> }).env.HOST).toBe('api.example.com');
  });
});

describe('compareVersions', () => {
  it('orders dotted semver numerically', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '1.99.0')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0', '1.0.1')).toBeLessThan(0);
  });
});
