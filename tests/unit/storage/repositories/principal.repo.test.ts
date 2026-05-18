import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../../src/storage/sqlite.adapter.js';

describe('PrincipalRepo', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => { storage = await makeStorage(); });
  afterEach(async () => { await storage.close(); });

  it('creates a service_account principal', async () => {
    const p = await storage.principals.createServiceAccount({
      id: 'prn_1', displayName: 'admin', description: 'bootstrap', isBootstrap: true,
    });
    expect(p.id).toBe('prn_1');
    expect(p.type).toBe('service_account');
    expect(p.isBootstrap).toBe(true);
  });

  it('finds bootstrap admin', async () => {
    await storage.principals.createServiceAccount({
      id: 'prn_1', displayName: 'admin', isBootstrap: true,
    });
    const found = await storage.principals.findBootstrapAdmin();
    expect(found?.id).toBe('prn_1');
  });

  it('returns null when no bootstrap admin exists', async () => {
    const found = await storage.principals.findBootstrapAdmin();
    expect(found).toBeNull();
  });

  it('findById returns full principal data', async () => {
    await storage.principals.createMCPClient({
      id: 'prn_m', displayName: 'claude', allowedServers: ['db', 'fs'],
    });
    const found = await storage.principals.findById('prn_m');
    expect(found?.type).toBe('mcp_client');
    expect(found?.allowedServers).toEqual(['db', 'fs']);
  });

  it('returns null when principal does not exist', async () => {
    expect(await storage.principals.findById('nope')).toBeNull();
  });

  it('sets disabled flag', async () => {
    await storage.principals.createServiceAccount({ id: 'p', displayName: 'x' });
    await storage.principals.setDisabled('p', true);
    const found = await storage.principals.findById('p');
    expect(found?.disabled).toBe(true);
  });
});
