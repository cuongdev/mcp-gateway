import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../../src/storage/sqlite.adapter.js';

describe('ProxyRepo', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => { storage = await makeStorage(); });
  afterEach(async () => { await storage.close(); });

  it('create + findByName round-trip', async () => {
    const p = await storage.proxies.create({
      id: 'prx_1', name: 'corp', url: 'http://corp:8080', description: 'main egress',
    });
    expect(p.url).toBe('http://corp:8080');
    expect(p.enabled).toBe(true);
    const found = await storage.proxies.findByName('corp');
    expect(found?.id).toBe('prx_1');
  });

  it('findById returns the row', async () => {
    await storage.proxies.create({ id: 'prx_1', name: 'corp', url: 'http://corp:8080' });
    expect((await storage.proxies.findById('prx_1'))?.name).toBe('corp');
  });

  it('list returns all proxies ordered by name', async () => {
    await storage.proxies.create({ id: 'prx_b', name: 'b', url: 'http://b:80' });
    await storage.proxies.create({ id: 'prx_a', name: 'a', url: 'http://a:80' });
    const all = await storage.proxies.list();
    expect(all.map((p) => p.name)).toEqual(['a', 'b']);
  });

  it('update changes url + description', async () => {
    await storage.proxies.create({ id: 'prx_1', name: 'corp', url: 'http://corp:8080' });
    await storage.proxies.update('prx_1', { url: 'http://corp:9090', description: 'updated' });
    const p = await storage.proxies.findById('prx_1');
    expect(p?.url).toBe('http://corp:9090');
    expect(p?.description).toBe('updated');
  });

  it('setEnabled toggles flag', async () => {
    await storage.proxies.create({ id: 'prx_1', name: 'corp', url: 'http://corp:8080' });
    await storage.proxies.setEnabled('prx_1', false);
    expect((await storage.proxies.findById('prx_1'))?.enabled).toBe(false);
  });

  it('delete removes the proxy', async () => {
    await storage.proxies.create({ id: 'prx_1', name: 'corp', url: 'http://corp:8080' });
    await storage.proxies.delete('prx_1');
    expect(await storage.proxies.findById('prx_1')).toBeNull();
  });

  it('duplicate name throws', async () => {
    await storage.proxies.create({ id: 'prx_a', name: 'corp', url: 'http://a:80' });
    await expect(storage.proxies.create({ id: 'prx_b', name: 'corp', url: 'http://b:80' })).rejects.toThrow();
  });

  it('references returns servers + groups using this proxy', async () => {
    await storage.proxies.create({ id: 'prx_1', name: 'corp', url: 'http://corp:8080' });
    await storage.servers.upsert({ name: 'acme', transportType: 'streamable-http', transportConfig: { url: 'u' } });
    await storage.groups.create({ name: 'g', description: '', allowedRoles: [], tools: [] });
    await storage.servers.setProxyName('acme', 'corp');
    await storage.groups.setProxyName('g', 'corp');
    const refs = await storage.proxies.references('corp');
    expect(refs.find((r) => r.kind === 'server' && r.name === 'acme')).toBeDefined();
    expect(refs.find((r) => r.kind === 'group' && r.name === 'g')).toBeDefined();
  });

  it('detachAll nullifies proxy_name on all referencing rows', async () => {
    await storage.proxies.create({ id: 'prx_1', name: 'corp', url: 'http://corp:8080' });
    await storage.servers.upsert({ name: 'acme', transportType: 'streamable-http', transportConfig: { url: 'u' } });
    await storage.groups.create({ name: 'g', description: '', allowedRoles: [], tools: [] });
    await storage.servers.setProxyName('acme', 'corp');
    await storage.groups.setProxyName('g', 'corp');
    const detached = await storage.proxies.detachAll('corp');
    expect(detached.length).toBe(2);
    expect((await storage.servers.findByName('acme'))?.proxyName).toBeUndefined();
    expect((await storage.groups.findByName('g'))?.proxyName).toBeUndefined();
  });

  it('servers.proxyName round-trips', async () => {
    await storage.servers.upsert({ name: 'acme', transportType: 'streamable-http', transportConfig: { url: 'u' } });
    expect((await storage.servers.findByName('acme'))?.proxyName).toBeUndefined();
    await storage.servers.setProxyName('acme', 'corp');
    expect((await storage.servers.findByName('acme'))?.proxyName).toBe('corp');
    await storage.servers.setProxyName('acme', null);
    expect((await storage.servers.findByName('acme'))?.proxyName).toBeUndefined();
  });

  it('groups.proxyName round-trips', async () => {
    await storage.groups.create({ name: 'g', description: '', allowedRoles: [], tools: [] });
    expect((await storage.groups.findByName('g'))?.proxyName).toBeUndefined();
    await storage.groups.setProxyName('g', 'corp');
    expect((await storage.groups.findByName('g'))?.proxyName).toBe('corp');
    await storage.groups.setProxyName('g', null);
    expect((await storage.groups.findByName('g'))?.proxyName).toBeUndefined();
  });
});
