import { SqliteAdapter } from './sqlite.adapter.js';
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
  throw new Error(`Storage driver '${cfg.driver}' not supported in P0 (postgres ships in P1)`);
}

export type { StorageAdapter, Tx } from './adapter.js';
export { SqliteAdapter } from './sqlite.adapter.js';
