import postgres from 'postgres';
import { withSpan } from '../observability/spans.js';
import type { StorageAdapter, Tx } from './adapter.js';
import { PrincipalRepo } from './repositories/principal.repo.js';
import { TokenRepo } from './repositories/token.repo.js';
import { ServerRepo } from './repositories/server.repo.js';
import { ToolRepo } from './repositories/tool.repo.js';
import { GroupRepo } from './repositories/group.repo.js';
import { PolicyRepo } from './repositories/policy.repo.js';
import { AuditRepo } from './repositories/audit.repo.js';
import { PromptRepo } from './repositories/prompt.repo.js';
import { UsageCounterRepo } from './repositories/usage-counter.repo.js';
import { CacheEntryRepo } from './repositories/cache-entry.repo.js';
import { ApprovalRepo } from './repositories/approval.repo.js';
import { WebhookRepo } from './repositories/webhook.repo.js';
import { WebhookDeliveryRepo } from './repositories/webhook-delivery.repo.js';
import { TenantRepo } from './repositories/tenant.repo.js';
import { listMigrations } from './migrations/index.js';

export interface PostgresAdapterOptions {
  url: string;
}

/**
 * PostgresAdapter implements the StorageAdapter interface against PostgreSQL.
 *
 * The existing repos target libsql's Client (`client.execute({sql,args})` returning
 * `{rows, rowsAffected, lastInsertRowid?}` with `?` placeholders). We bridge that
 * surface with a small in-process shim (`LibsqlCompatClient`) which:
 *   1. rewrites `?` placeholders to `$1, $2, ...`
 *   2. exposes the libsql-shaped result on top of postgres.js
 */
export class PostgresAdapter implements StorageAdapter {
  private readonly sql: postgres.Sql;
  private readonly client: LibsqlCompatClient;
  public readonly principals: PrincipalRepo;
  public readonly tokens: TokenRepo;
  public readonly servers: ServerRepo;
  public readonly tools: ToolRepo;
  public readonly groups: GroupRepo;
  public readonly policies: PolicyRepo;
  public readonly audit: AuditRepo;
  public readonly prompts: PromptRepo;
  public readonly usage: UsageCounterRepo;
  public readonly cache: CacheEntryRepo;
  public readonly approvals: ApprovalRepo;
  public readonly webhooks: WebhookRepo;
  public readonly webhookDeliveries: WebhookDeliveryRepo;
  public readonly tenants: TenantRepo;

  constructor(opts: PostgresAdapterOptions) {
    this.sql = postgres(opts.url, { onnotice: () => undefined });
    this.client = new LibsqlCompatClient(this.sql);
    // The repos accept libsql's `Client`; the compat shim satisfies the subset they
    // actually use (`execute(string | {sql, args})`).  We cast through `never` to
    // satisfy the `Client` parameter type without depending on libsql here.
    this.principals = new PrincipalRepo(this.client as never);
    this.tokens     = new TokenRepo(this.client as never);
    this.servers    = new ServerRepo(this.client as never);
    this.tools      = new ToolRepo(this.client as never);
    this.groups     = new GroupRepo(this.client as never);
    this.policies   = new PolicyRepo(this.client as never);
    this.audit      = new AuditRepo(this.client as never);
    this.prompts    = new PromptRepo(this.client as never);
    this.usage      = new UsageCounterRepo(this.client as never);
    this.cache      = new CacheEntryRepo(this.client as never);
    this.approvals  = new ApprovalRepo(this.client as never);
    this.webhooks   = new WebhookRepo(this.client as never);
    this.webhookDeliveries = new WebhookDeliveryRepo(this.client as never);
    this.tenants    = new TenantRepo(this.client as never);
  }

  async init(): Promise<void> {
    // schema_migrations table is included in the postgres 0001 migration, but
    // create it idempotently up-front so we can read prior applied versions.
    await this.sql.unsafe(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    INTEGER PRIMARY KEY,
        applied_at BIGINT NOT NULL
      )
    `);
    const applied = await this.sql<{ version: number }[]>`
      SELECT version FROM schema_migrations ORDER BY version
    `;
    const appliedSet = new Set(applied.map((r) => Number(r.version)));
    const migrations = listMigrations('postgres');
    for (const m of migrations) {
      if (appliedSet.has(m.version)) continue;
      // Run each migration in its own transaction; postgres.js will roll back
      // automatically if the callback throws.
      await this.sql.begin(async (tx) => {
        await tx.unsafe(m.sql);
        await tx`INSERT INTO schema_migrations(version, applied_at)
                 VALUES (${m.version}, ${Date.now()})`;
      });
    }
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    await this.sql.unsafe(rewriteParams(sql), params as never);
  }

  async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return withSpan('storage.transaction', { 'storage.driver': 'postgres' }, async () => {
      const result = await this.sql.begin(async (sqlTx) => {
        const wrapper: Tx = {
          async execute(sql, params = []) {
            const r = await sqlTx.unsafe(rewriteParams(sql), params as never);
            return { rowsAffected: r.count };
          },
          async query(sql, params = []) {
            const r = await sqlTx.unsafe(rewriteParams(sql), params as never);
            return r as never;
          },
          async queryOne(sql, params = []) {
            const r = await sqlTx.unsafe(rewriteParams(sql), params as never);
            return (r[0] ?? null) as never;
          },
        };
        return fn(wrapper);
      });
      // postgres.js' `begin` callback return type is inferred as `unknown` in some
      // call sites — cast to `T` since we know the callback returns `T`.
      return result as T;
    });
  }
}

/** Rewrites libsql's `?` placeholders to Postgres' `$N` numbered placeholders. */
function rewriteParams(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/**
 * Minimal compatibility shim that presents libsql's Client surface (the subset
 * the repos use) on top of `postgres.Sql`.
 *
 * Repos call:
 *   - `client.execute({sql, args})` or `client.execute(rawSqlString)`
 *   - and read `result.rows`, `result.rowsAffected`.
 */
class LibsqlCompatClient {
  constructor(private readonly sql: postgres.Sql) {}

  async execute(input: string | { sql: string; args?: unknown[] }): Promise<{
    rows: Array<Record<string, unknown>>;
    rowsAffected: number;
    lastInsertRowid?: bigint;
  }> {
    const sql = typeof input === 'string' ? input : input.sql;
    const args = typeof input === 'string' ? [] : (input.args ?? []);
    const r = await this.sql.unsafe(rewriteParams(sql), args as never);
    return {
      rows: r as unknown as Array<Record<string, unknown>>,
      rowsAffected: r.count,
    };
  }

  /**
   * libsql's MigrationRunner uses `executeMultiple` to apply multi-statement
   * migration SQL.  PostgresAdapter.init() bypasses that runner and applies
   * migrations directly via `sql.begin` + `sql.unsafe`, so this method exists
   * only as a safety fallback for any code path that calls it.
   */
  async executeMultiple(sql: string): Promise<void> {
    await this.sql.unsafe(sql);
  }

  /**
   * libsql Client exposes a synchronous `close()`.  Connection lifecycle is
   * managed by `PostgresAdapter.close()`; we keep this as a no-op so the shim
   * type matches the libsql surface repos rely on.
   */
  close(): void { /* lifecycle owned by PostgresAdapter */ }
}
