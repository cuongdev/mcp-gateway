import { SqliteAdapter } from './sqlite.adapter.js';
import { PostgresAdapter } from './postgres.adapter.js';
import type { StorageAdapter } from './adapter.js';

export interface StorageConfig {
  driver: 'sqlite' | 'postgres';
  path?: string;        // sqlite file path or :memory:
  url?: string;         // postgres DATABASE_URL (P1)
  authToken?: string;   // Turso (optional)
}

export async function createStorage(cfg: StorageConfig): Promise<StorageAdapter> {
  if (cfg.driver === 'sqlite') {
    const url = cfg.path === ':memory:' ? ':memory:' : `file:${cfg.path ?? './data/mcp.sqlite'}`;
    const adapter = new SqliteAdapter({ url, authToken: cfg.authToken });
    await adapter.init();
    return adapter;
  }
  if (cfg.driver === 'postgres') {
    if (!cfg.url) throw new Error('Postgres driver requires `url` (DATABASE_URL)');
    const adapter = new PostgresAdapter({ url: cfg.url });
    await adapter.init();
    return adapter;
  }
  throw new Error(`Unknown driver: ${cfg.driver}`);
}

export type { StorageAdapter, Tx } from './adapter.js';
export { SqliteAdapter } from './sqlite.adapter.js';
export { PostgresAdapter } from './postgres.adapter.js';
