import { SqliteAdapter } from '../../../src/storage/sqlite.adapter.js';

export async function makeStorage(): Promise<SqliteAdapter> {
  const a = new SqliteAdapter({ url: ':memory:' });
  await a.init();
  return a;
}
