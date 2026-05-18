import type { Client } from '@libsql/client';
import { listMigrations, type MigrationFile } from './migrations/index.js';

export interface MigrationStatus {
  applied: number[];
  pending: MigrationFile[];
}

export class MigrationRunner {
  constructor(
    private readonly client: Client,
    private readonly dialect: 'sqlite' | 'postgres' = 'sqlite'
  ) {}

  async ensureMetaTable(): Promise<void> {
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      )
    `);
  }

  async appliedVersions(): Promise<number[]> {
    await this.ensureMetaTable();
    const rs = await this.client.execute('SELECT version FROM schema_migrations ORDER BY version');
    return rs.rows.map((r) => Number(r.version));
  }

  async status(): Promise<MigrationStatus> {
    const applied = await this.appliedVersions();
    const all = listMigrations(this.dialect);
    const pending = all.filter((m) => !applied.includes(m.version));
    return { applied, pending };
  }

  async up(): Promise<MigrationFile[]> {
    const { pending } = await this.status();
    const applied: MigrationFile[] = [];
    for (const m of pending) {
      await this.applyOne(m);
      applied.push(m);
    }
    return applied;
  }

  private async applyOne(m: MigrationFile): Promise<void> {
    try {
      await this.client.executeMultiple(m.sql);
      await this.client.execute({
        sql: 'INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)',
        args: [m.version, Date.now()],
      });
    } catch (err) {
      throw new Error(`Migration ${m.version} (${m.name}) failed: ${(err as Error).message}`);
    }
  }
}
