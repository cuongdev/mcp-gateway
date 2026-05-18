import { describe, it, expect } from 'vitest';
import { SqliteAdapter } from '../../../src/storage/sqlite.adapter.js';

describe('SqliteAdapter', () => {
  it('init runs migrations and is idempotent', async () => {
    const a = new SqliteAdapter({ url: ':memory:' });
    await a.init();
    await a.init(); // should not throw
    await a.close();
  });

  it('transaction commits on success', async () => {
    const a = new SqliteAdapter({ url: ':memory:' });
    await a.init();
    await a.transaction(async (tx) => {
      await tx.execute(
        'INSERT INTO principals(id, type, display_name, disabled, created_at) VALUES (?, ?, ?, 0, ?)',
        ['p1', 'service_account', 'test', Date.now()],
      );
    });
    const rows = await a.transaction(async (tx) => tx.query('SELECT * FROM principals'));
    expect(rows.length).toBe(1);
    await a.close();
  });

  it('transaction rolls back on error', async () => {
    const a = new SqliteAdapter({ url: ':memory:' });
    await a.init();
    await expect(a.transaction(async (tx) => {
      await tx.execute(
        'INSERT INTO principals(id, type, display_name, disabled, created_at) VALUES (?, ?, ?, 0, ?)',
        ['p1', 'service_account', 'test', Date.now()],
      );
      throw new Error('boom');
    })).rejects.toThrow('boom');
    const rows = await a.transaction(async (tx) => tx.query('SELECT * FROM principals'));
    expect(rows.length).toBe(0);
    await a.close();
  });
});
