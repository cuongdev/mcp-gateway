import { describe, it, expect, beforeEach } from 'vitest';
import { createClient, type Client } from '@libsql/client';
import { MigrationRunner } from '../../../src/storage/migration.runner.js';

describe('MigrationRunner', () => {
  let client: Client;

  beforeEach(() => {
    client = createClient({ url: ':memory:' });
  });

  it('applies pending migrations and records them', async () => {
    const runner = new MigrationRunner(client, 'sqlite');
    const applied = await runner.up();
    expect(applied.length).toBe(5);
    expect(applied[0].version).toBe(1);
    expect(applied[1].version).toBe(2);

    const rows = await client.execute('SELECT * FROM schema_migrations ORDER BY version');
    expect(rows.rows.length).toBe(5);
    expect(rows.rows[0].version).toBe(1);
    expect(rows.rows[1].version).toBe(2);
  });

  it('is idempotent — second run applies nothing', async () => {
    const runner = new MigrationRunner(client, 'sqlite');
    await runner.up();
    const second = await runner.up();
    expect(second.length).toBe(0);
  });

  it('status reports applied + pending versions', async () => {
    const runner = new MigrationRunner(client, 'sqlite');
    let status = await runner.status();
    expect(status.applied).toEqual([]);
    expect(status.pending.map((m) => m.version)).toEqual([1, 2, 3, 4, 5]);

    await runner.up();
    status = await runner.status();
    expect(status.applied).toEqual([1, 2, 3, 4, 5]);
    expect(status.pending).toEqual([]);
  });
});
