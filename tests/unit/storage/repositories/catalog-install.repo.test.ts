import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../../src/storage/sqlite.adapter.js';

describe('CatalogInstallRepo', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => { storage = await makeStorage(); });
  afterEach(async () => { await storage.close(); });

  it('create + findById round-trip', async () => {
    const row = await storage.catalogInstalls.create({
      id: 'inst_1',
      connectorId: 'github',
      templateVersion: '1.0.0',
      serverName: 'github',
      configSnapshotJson: '{"env":{"GITHUB_TOKEN":"***"}}',
      installedBy: 'usr_admin',
    });
    expect(row.id).toBe('inst_1');
    expect(row.connectorId).toBe('github');
    expect(row.templateVersion).toBe('1.0.0');
    expect(row.serverName).toBe('github');
    expect(row.configSnapshotJson).toContain('***');
    expect(row.installedBy).toBe('usr_admin');
    expect(row.tenantId).toBe('tnt_default');

    const found = await storage.catalogInstalls.findById('inst_1');
    expect(found?.connectorId).toBe('github');
  });

  it('findByServerName returns row for the tenant', async () => {
    await storage.catalogInstalls.create({
      id: 'inst_a',
      connectorId: 'slack',
      templateVersion: '1.0.0',
      serverName: 'slack-prod',
      configSnapshotJson: '{}',
    });
    const r = await storage.catalogInstalls.findByServerName('slack-prod');
    expect(r?.id).toBe('inst_a');
    const miss = await storage.catalogInstalls.findByServerName('nope');
    expect(miss).toBeNull();
  });

  it('list returns rows newest-first within a tenant', async () => {
    await storage.catalogInstalls.create({
      id: 'inst_a', connectorId: 'github', templateVersion: '1.0.0',
      serverName: 'a', configSnapshotJson: '{}',
    });
    // ensure ordering by installed_at differs
    await new Promise((r) => setTimeout(r, 5));
    await storage.catalogInstalls.create({
      id: 'inst_b', connectorId: 'gitlab', templateVersion: '1.0.0',
      serverName: 'b', configSnapshotJson: '{}',
    });
    const all = await storage.catalogInstalls.list();
    expect(all.map((r) => r.id)).toEqual(['inst_b', 'inst_a']);
  });

  it('delete removes the install row', async () => {
    await storage.catalogInstalls.create({
      id: 'inst_x', connectorId: 'github', templateVersion: '1.0.0',
      serverName: 'gh', configSnapshotJson: '{}',
    });
    await storage.catalogInstalls.delete('inst_x');
    expect(await storage.catalogInstalls.findById('inst_x')).toBeNull();
  });

  it('unique constraint on (tenant_id, server_name) rejects duplicate installs', async () => {
    await storage.catalogInstalls.create({
      id: 'inst_a', connectorId: 'github', templateVersion: '1.0.0',
      serverName: 'gh', configSnapshotJson: '{}',
    });
    await expect(storage.catalogInstalls.create({
      id: 'inst_b', connectorId: 'github', templateVersion: '1.0.0',
      serverName: 'gh', configSnapshotJson: '{}',
    })).rejects.toThrow();
  });
});
