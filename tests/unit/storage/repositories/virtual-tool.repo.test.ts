import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../../src/storage/sqlite.adapter.js';

const SAMPLE_SCHEMA = JSON.stringify({ type: 'object', properties: { q: { type: 'string' } } });
const SAMPLE_PLAN = JSON.stringify({
  name: 'vt_search',
  description: 'search',
  inputSchema: { type: 'object' },
  steps: [{ id: 's1', tool: 'srv__search', args: { q: '{{input.q}}' } }],
  output: { format: 'merged', shape: { items: '{{steps.s1.result}}' } },
  errorPolicy: 'fail_fast',
});

describe('VirtualToolRepo', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => { storage = await makeStorage(); });
  afterEach(async () => { await storage.close(); });

  it('create + findByName round-trip', async () => {
    const row = await storage.virtualTools.create({
      canonicalName: 'vt_search',
      description: 'composite search',
      inputSchemaJson: SAMPLE_SCHEMA,
      planJson: SAMPLE_PLAN,
      createdBy: 'usr_admin',
    });
    expect(row.canonicalName).toBe('vt_search');
    expect(row.errorPolicy).toBe('fail_fast');
    expect(row.enabled).toBe(true);
    expect(row.tenantId).toBe('tnt_default');

    const found = await storage.virtualTools.findByName('vt_search');
    expect(found?.description).toBe('composite search');
    expect(JSON.parse(found!.planJson).steps[0].id).toBe('s1');
  });

  it('list returns rows sorted by canonical_name', async () => {
    await storage.virtualTools.create({
      canonicalName: 'vt_b', inputSchemaJson: SAMPLE_SCHEMA, planJson: SAMPLE_PLAN,
    });
    await storage.virtualTools.create({
      canonicalName: 'vt_a', inputSchemaJson: SAMPLE_SCHEMA, planJson: SAMPLE_PLAN,
    });
    const all = await storage.virtualTools.list();
    expect(all.map((r) => r.canonicalName)).toEqual(['vt_a', 'vt_b']);
  });

  it('update patches description / planJson / errorPolicy', async () => {
    await storage.virtualTools.create({
      canonicalName: 'vt_x', inputSchemaJson: SAMPLE_SCHEMA, planJson: SAMPLE_PLAN,
    });
    const patched = await storage.virtualTools.update('vt_x', {
      description: 'new desc',
      errorPolicy: 'best_effort',
    });
    expect(patched?.description).toBe('new desc');
    expect(patched?.errorPolicy).toBe('best_effort');
  });

  it('setEnabled toggles enabled flag', async () => {
    await storage.virtualTools.create({
      canonicalName: 'vt_y', inputSchemaJson: SAMPLE_SCHEMA, planJson: SAMPLE_PLAN,
    });
    await storage.virtualTools.setEnabled('vt_y', false);
    const r = await storage.virtualTools.findByName('vt_y');
    expect(r?.enabled).toBe(false);
  });

  it('delete removes the row', async () => {
    await storage.virtualTools.create({
      canonicalName: 'vt_z', inputSchemaJson: SAMPLE_SCHEMA, planJson: SAMPLE_PLAN,
    });
    await storage.virtualTools.delete('vt_z');
    expect(await storage.virtualTools.findByName('vt_z')).toBeNull();
  });
});
