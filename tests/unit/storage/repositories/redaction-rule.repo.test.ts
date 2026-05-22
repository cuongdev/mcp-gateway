import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../../src/storage/sqlite.adapter.js';

describe('RedactionRuleRepo', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => { storage = await makeStorage(); });
  afterEach(async () => { await storage.close(); });

  it('create + findById + findByName round-trip', async () => {
    const row = await storage.redactionRules.create({
      id: 'aws_access_key',
      name: 'AWS Access Key',
      kind: 'api_key.aws_access_key',
      pattern: 'AKIA[0-9A-Z]{16}',
      mode: 'redact',
      replacement: '[REDACTED]',
      builtIn: true,
    });
    expect(row.name).toBe('AWS Access Key');
    expect(row.enabled).toBe(true);
    expect(row.builtIn).toBe(true);
    expect((await storage.redactionRules.findById('aws_access_key'))?.kind).toBe('api_key.aws_access_key');
    expect((await storage.redactionRules.findByName('AWS Access Key'))?.id).toBe('aws_access_key');
  });

  it('list filters by tenantId, builtIn, enabled', async () => {
    await storage.redactionRules.create({ id: 'a', name: 'A', kind: 'k.a', pattern: 'x', builtIn: true });
    await storage.redactionRules.create({ id: 'b', name: 'B', kind: 'k.b', pattern: 'y', builtIn: false });
    await storage.redactionRules.create({ id: 'c', name: 'C', kind: 'k.c', pattern: 'z', builtIn: true, enabled: false });

    expect((await storage.redactionRules.list()).length).toBe(3);
    expect((await storage.redactionRules.list({ builtIn: true })).length).toBe(2);
    expect((await storage.redactionRules.list({ builtIn: false })).length).toBe(1);
    expect((await storage.redactionRules.list({ enabled: true })).length).toBe(2);
    expect((await storage.redactionRules.list({ enabled: false })).length).toBe(1);
  });

  it('update mode + setEnabled + setMode + delete', async () => {
    await storage.redactionRules.create({ id: 'r1', name: 'rule', kind: 'k', pattern: 'p' });
    await storage.redactionRules.setMode('r1', 'block');
    expect((await storage.redactionRules.findById('r1'))?.mode).toBe('block');
    await storage.redactionRules.setEnabled('r1', false);
    expect((await storage.redactionRules.findById('r1'))?.enabled).toBe(false);
    await storage.redactionRules.update('r1', { priority: 50, replacement: '***' });
    const r = await storage.redactionRules.findById('r1');
    expect(r?.priority).toBe(50);
    expect(r?.replacement).toBe('***');
    await storage.redactionRules.delete('r1');
    expect(await storage.redactionRules.findById('r1')).toBeNull();
  });

  it('UNIQUE(tenant_id, name) enforced', async () => {
    await storage.redactionRules.create({ id: 'a', name: 'dup', kind: 'k', pattern: 'x' });
    await expect(
      storage.redactionRules.create({ id: 'b', name: 'dup', kind: 'k', pattern: 'y' })
    ).rejects.toThrow();
    // Different tenant — should succeed
    await storage.redactionRules.create({ id: 'c', name: 'dup', kind: 'k', pattern: 'z', tenantId: 'tnt_other' });
    expect((await storage.redactionRules.findByName('dup', 'tnt_other'))?.id).toBe('c');
  });
});
