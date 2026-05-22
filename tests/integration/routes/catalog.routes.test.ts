import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import { makeStorage } from '../../fixtures/helpers/make-storage.js';
import { ConnectorRegistry } from '../../../src/catalog/connectors.js';
import { CatalogInstaller } from '../../../src/catalog/installer.js';
import { createCatalogRoutes } from '../../../src/routes/admin/catalog.routes.js';
import { SessionManager } from '../../../src/session/session.manager.js';
import { ToolRegistry } from '../../../src/registry/tool.registry.js';
import type { SqliteAdapter } from '../../../src/storage/sqlite.adapter.js';

async function setup() {
  const storage = await makeStorage();
  const registry = new ConnectorRegistry();
  registry.loadBuiltin();
  const sessionManager = new SessionManager();
  sessionManager.register = vi.fn();
  sessionManager.remove = vi.fn();
  sessionManager.discoverTools = vi.fn().mockResolvedValue([
    { name: 'create_issue', description: '', inputSchema: { type: 'object' } },
  ]);
  const toolRegistry = new ToolRegistry(storage);
  const installer = new CatalogInstaller(registry, storage, sessionManager, toolRegistry);

  const app = new Hono();
  app.route('/api/catalog', createCatalogRoutes({ registry, installer, storage }));
  return { app, storage, registry, installer };
}

describe('catalog admin routes', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { env = await setup(); });
  afterEach(async () => { await env.storage.close(); });

  it('GET /connectors returns the catalog', async () => {
    const r = await env.app.request('/api/catalog/connectors');
    expect(r.status).toBe(200);
    const body = await r.json() as { connectors: Array<{ id: string }> };
    expect(body.connectors.length).toBeGreaterThanOrEqual(30);
    expect(body.connectors.find((c) => c.id === 'github')).toBeDefined();
  });

  it('GET /connectors?category=databases filters by category', async () => {
    const r = await env.app.request('/api/catalog/connectors?category=databases');
    expect(r.status).toBe(200);
    const body = await r.json() as { connectors: Array<{ category: string }> };
    expect(body.connectors.every((c) => c.category === 'databases')).toBe(true);
  });

  it('GET /connectors?category=bad returns 400', async () => {
    const r = await env.app.request('/api/catalog/connectors?category=bad');
    expect(r.status).toBe(400);
  });

  it('GET /connectors/:id returns a template or 404', async () => {
    const r = await env.app.request('/api/catalog/connectors/github');
    expect(r.status).toBe(200);
    const body = await r.json() as { id: string; templateVersion: string };
    expect(body.id).toBe('github');
    expect(body.templateVersion).toBe('1.0.0');

    const miss = await env.app.request('/api/catalog/connectors/nope');
    expect(miss.status).toBe(404);
  });

  it('POST /install registers a server and creates an install row', async () => {
    const r = await env.app.request('/api/catalog/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connectorId: 'github',
        name: 'github',
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_x' },
      }),
    });
    expect(r.status).toBe(201);
    const body = await r.json() as { server: string; capabilitiesDiscovered: number };
    expect(body.server).toBe('github');
    expect(body.capabilitiesDiscovered).toBe(1);

    expect(await env.storage.servers.findByName('github')).not.toBeNull();
  });

  it('POST /install returns 404 on unknown connectorId', async () => {
    const r = await env.app.request('/api/catalog/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectorId: 'nope', name: 'x', env: {} }),
    });
    expect(r.status).toBe(404);
  });

  it('POST /install returns 400 on missing required env', async () => {
    const r = await env.app.request('/api/catalog/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectorId: 'github', name: 'github', env: {} }),
    });
    expect(r.status).toBe(400);
  });

  it('POST /install returns 400 on malformed body', async () => {
    const r = await env.app.request('/api/catalog/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectorId: 'github' }),
    });
    expect(r.status).toBe(400);
  });

  it('GET /installs lists installed connectors with updateAvailable flag', async () => {
    await env.installer.install({
      connectorId: 'github',
      name: 'github',
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_x' },
    });
    const r = await env.app.request('/api/catalog/installs');
    expect(r.status).toBe(200);
    const body = await r.json() as { installs: Array<{ serverName: string; updateAvailable: boolean }> };
    expect(body.installs).toHaveLength(1);
    expect(body.installs[0].serverName).toBe('github');
    expect(body.installs[0].updateAvailable).toBe(false);
  });

  it('POST /installs/:id/update returns 501 (deferred)', async () => {
    const r = await env.app.request('/api/catalog/installs/inst_x/update', {
      method: 'POST',
    });
    expect(r.status).toBe(501);
  });

  it('DELETE /installs/:id uninstalls the connector', async () => {
    const result = await env.installer.install({
      connectorId: 'github',
      name: 'github',
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_x' },
    });
    const r = await env.app.request(`/api/catalog/installs/${result.id}`, {
      method: 'DELETE',
    });
    expect(r.status).toBe(200);
    expect(await env.storage.servers.findByName('github')).toBeNull();
    expect(await env.storage.catalogInstalls.findById(result.id)).toBeNull();
  });

  it('DELETE /installs/:id returns 404 when not found', async () => {
    const r = await env.app.request('/api/catalog/installs/missing', {
      method: 'DELETE',
    });
    expect(r.status).toBe(404);
  });
});
