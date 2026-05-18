import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  makePgStorage,
  HAS_DOCKER,
  type PgTestEnv,
} from '../fixtures/helpers/make-pg-storage.js';

const describePg = HAS_DOCKER ? describe : describe.skip;

describePg('PostgresAdapter contract', () => {
  let env: PgTestEnv;
  beforeAll(async () => {
    env = await makePgStorage();
  }, 60_000);
  afterAll(async () => {
    await env?.close();
  });

  it('init runs migrations and creates all expected tables', async () => {
    const expected = [
      'principals',
      'users',
      'service_accounts',
      'mcp_clients',
      'tokens',
      'servers',
      'tools',
      'groups',
      'group_tools',
      'policies',
      'audit_logs',
      'prompts',
      'group_included_servers',
      'group_excluded_tools',
      'schema_migrations',
    ];
    for (const t of expected) {
      // SELECT 1 ... LIMIT 0 only validates the table exists & is queryable.
      await env.storage.transaction(async (tx) =>
        tx.query(`SELECT 1 FROM ${t} LIMIT 0`),
      );
    }
  });

  it('round-trip PrincipalRepo create + findById', async () => {
    await env.storage.principals.createServiceAccount({
      id: 'prn_pg_1',
      displayName: 'admin',
      isBootstrap: true,
    });
    const p = await env.storage.principals.findById('prn_pg_1');
    expect(p?.type).toBe('service_account');
    expect(p?.isBootstrap).toBe(true);
  });

  it('round-trip ServerRepo upsert + list', async () => {
    await env.storage.servers.upsert({
      name: 'pg_srv',
      transportType: 'streamable-http',
      transportConfig: { url: 'u' },
    });
    const list = await env.storage.servers.list();
    expect(list.some((s) => s.name === 'pg_srv')).toBe(true);
  });
});
