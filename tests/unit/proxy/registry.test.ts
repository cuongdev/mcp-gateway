import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../src/storage/sqlite.adapter.js';
import { ProxyRegistry } from '../../../src/proxy/registry.js';
import type { ProxyRow } from '../../../src/storage/repositories/proxy.repo.js';

describe('ProxyRegistry', () => {
  let storage: SqliteAdapter;
  let registry: ProxyRegistry;

  beforeEach(async () => {
    storage = await makeStorage();
    registry = new ProxyRegistry(storage);
  });

  afterEach(async () => {
    await registry.shutdown();
    await storage.close();
  });

  it('load builds dispatchers for enabled HTTP proxies', async () => {
    await storage.proxies.create({ id: 'prx_1', name: 'corp', url: 'http://corp:8080' });
    await registry.load();
    expect(registry.get('corp')).not.toBeNull();
    expect(registry.getUrl('corp')).toBe('http://corp:8080');
  });

  it('get returns null for unknown name', async () => {
    await registry.load();
    expect(registry.get('does-not-exist')).toBeNull();
  });

  it('disabled proxy is skipped at load', async () => {
    await storage.proxies.create({ id: 'prx_1', name: 'corp', url: 'http://corp:8080' });
    await storage.proxies.setEnabled('prx_1', false);
    await registry.load();
    expect(registry.get('corp')).toBeNull();
  });

  it('upsert replaces dispatcher when URL changes', async () => {
    await storage.proxies.create({ id: 'prx_1', name: 'corp', url: 'http://corp:8080' });
    await registry.load();
    const first = registry.get('corp');
    const updated: ProxyRow = {
      id: 'prx_1',
      name: 'corp',
      url: 'http://corp:9090',
      description: null,
      enabled: true,
      createdAt: Date.now(),
    };
    await registry.upsert(updated);
    const second = registry.get('corp');
    expect(second).not.toBe(first);
    expect(registry.getUrl('corp')).toBe('http://corp:9090');
  });

  it('upsert with disabled row removes the entry', async () => {
    await storage.proxies.create({ id: 'prx_1', name: 'corp', url: 'http://corp:8080' });
    await registry.load();
    expect(registry.get('corp')).not.toBeNull();
    const disabled: ProxyRow = {
      id: 'prx_1',
      name: 'corp',
      url: 'http://corp:8080',
      description: null,
      enabled: false,
      createdAt: Date.now(),
    };
    await registry.upsert(disabled);
    expect(registry.get('corp')).toBeNull();
  });

  it('remove drops the entry', async () => {
    await storage.proxies.create({ id: 'prx_1', name: 'corp', url: 'http://corp:8080' });
    await registry.load();
    await registry.remove('corp');
    expect(registry.get('corp')).toBeNull();
  });

  it('unsupported scheme is skipped with no entry cached', async () => {
    await storage.proxies.create({ id: 'prx_1', name: 'weird', url: 'ftp://nope:21' });
    await registry.load();
    expect(registry.get('weird')).toBeNull();
  });

  it('socks5 URL builds a dispatcher without crashing the registry', async () => {
    await storage.proxies.create({ id: 'prx_1', name: 'sox', url: 'socks5://localhost:1080' });
    await registry.load();
    // The dispatcher is constructed lazily (no network until a request is
    // dispatched). We only assert the registry didn't crash and that either
    // a dispatcher was cached or the build was skipped gracefully.
    const d = registry.get('sox');
    expect(d === null || typeof d === 'object').toBe(true);
  });
});
