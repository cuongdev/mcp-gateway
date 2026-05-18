import { createClient, type Client } from '@libsql/client';
import type { StorageAdapter, Tx } from './adapter.js';
import { MigrationRunner } from './migration.runner.js';
import { PrincipalRepo } from './repositories/principal.repo.js';
import { TokenRepo } from './repositories/token.repo.js';
import { ServerRepo } from './repositories/server.repo.js';
import { ToolRepo } from './repositories/tool.repo.js';
import { GroupRepo } from './repositories/group.repo.js';
import { PolicyRepo } from './repositories/policy.repo.js';
import { AuditRepo } from './repositories/audit.repo.js';

export interface SqliteAdapterOptions {
  url: string;                  // 'file:./data/mcp.sqlite' or ':memory:'
  authToken?: string;           // for Turso remote (optional)
}

export class SqliteAdapter implements StorageAdapter {
  private readonly client: Client;
  public readonly principals: PrincipalRepo;
  public readonly tokens: TokenRepo;
  public readonly servers: ServerRepo;
  public readonly tools: ToolRepo;
  public readonly groups: GroupRepo;
  public readonly policies: PolicyRepo;
  public readonly audit: AuditRepo;

  constructor(options: SqliteAdapterOptions) {
    this.client = createClient({ url: options.url, authToken: options.authToken });
    this.principals = new PrincipalRepo(this.client);
    this.tokens = new TokenRepo(this.client);
    this.servers = new ServerRepo(this.client);
    this.tools = new ToolRepo(this.client);
    this.groups = new GroupRepo(this.client);
    this.policies = new PolicyRepo(this.client);
    this.audit = new AuditRepo(this.client);
  }

  async init(): Promise<void> {
    // Enable WAL + busy_timeout (no-op for :memory:)
    await this.client.execute('PRAGMA journal_mode=WAL').catch(() => undefined);
    await this.client.execute('PRAGMA busy_timeout=5000').catch(() => undefined);
    await this.client.execute('PRAGMA foreign_keys=ON');

    const runner = new MigrationRunner(this.client, 'sqlite');
    await runner.up();
  }

  async close(): Promise<void> {
    this.client.close();
  }

  async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    // Use manual BEGIN/COMMIT/ROLLBACK via client.execute() so that all statements
    // stay on the same underlying connection.  libsql's transaction() API hands off
    // the connection and lazily creates a new one for subsequent client.execute()
    // calls, which breaks :memory: databases (each new connection is empty).
    await this.client.execute('BEGIN');
    const wrapper: Tx = {
      execute: async (sql, params = []) => {
        const r = await this.client.execute({ sql, args: params as never });
        return { rowsAffected: r.rowsAffected, lastInsertRowid: r.lastInsertRowid as bigint | undefined };
      },
      query: async (sql, params = []) => {
        const r = await this.client.execute({ sql, args: params as never });
        return r.rows as never;
      },
      queryOne: async (sql, params = []) => {
        const r = await this.client.execute({ sql, args: params as never });
        return (r.rows[0] ?? null) as never;
      },
    };
    try {
      const out = await fn(wrapper);
      await this.client.execute('COMMIT');
      return out;
    } catch (err) {
      await this.client.execute('ROLLBACK').catch(() => undefined);
      throw err;
    }
  }
}
