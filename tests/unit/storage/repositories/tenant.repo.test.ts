import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../../src/storage/sqlite.adapter.js';

describe('TenantRepo', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => { storage = await makeStorage(); });
  afterEach(async () => { await storage.close(); });

  it('tnt_default exists by default after migration', async () => {
    const t = await storage.tenants.findBySlug('default');
    expect(t?.id).toBe('tnt_default');
    expect(t?.status).toBe('active');
  });

  it('create + findBySlug round-trip', async () => {
    const t = await storage.tenants.create({
      id: 'tnt_acme', slug: 'acme', displayName: 'Acme Corp', plan: 'pro',
    });
    expect(t.slug).toBe('acme');
    expect(t.plan).toBe('pro');
    const found = await storage.tenants.findBySlug('acme');
    expect(found?.id).toBe('tnt_acme');
  });

  it('findById returns the row', async () => {
    await storage.tenants.create({ id: 'tnt_x', slug: 'x', displayName: 'X' });
    const t = await storage.tenants.findById('tnt_x');
    expect(t?.slug).toBe('x');
  });

  it('setStatus updates status', async () => {
    await storage.tenants.create({ id: 'tnt_x', slug: 'x', displayName: 'X' });
    await storage.tenants.setStatus('tnt_x', 'suspended');
    expect((await storage.tenants.findById('tnt_x'))?.status).toBe('suspended');
  });

  it('list returns all tenants including tnt_default', async () => {
    await storage.tenants.create({ id: 'tnt_a', slug: 'a', displayName: 'A' });
    await storage.tenants.create({ id: 'tnt_b', slug: 'b', displayName: 'B' });
    const all = await storage.tenants.list();
    expect(all.length).toBeGreaterThanOrEqual(3);
    expect(all.find((t) => t.slug === 'a')).toBeDefined();
    expect(all.find((t) => t.slug === 'default')).toBeDefined();
  });

  it('duplicate slug throws', async () => {
    await storage.tenants.create({ id: 'tnt_x', slug: 'dup', displayName: 'X' });
    await expect(storage.tenants.create({ id: 'tnt_y', slug: 'dup', displayName: 'Y' })).rejects.toThrow();
  });
});
