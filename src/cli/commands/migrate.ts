import type { Command } from 'commander';
import { createClient } from '@libsql/client';
import { MigrationRunner } from '../../storage/migration.runner.js';
import { ok, info, warn } from '../shared/output.js';

function resolveDbPath(opt?: string): string {
  return opt ?? process.env.MCP_DB_PATH ?? './data/mcp.sqlite';
}

function toLibsqlUrl(path: string): string {
  return path === ':memory:' ? ':memory:' : `file:${path}`;
}

export function registerMigrateCommands(program: Command): void {
  const m = program.command('migrate').description('Database schema migrations');

  m.command('up')
    .description('Apply all pending migrations')
    .option('--db <path>', 'SQLite database path')
    .action(async (opts) => {
      const path = resolveDbPath(opts.db);
      const client = createClient({ url: toLibsqlUrl(path) });
      const runner = new MigrationRunner(client, 'sqlite');
      const applied = await runner.up();
      ok(`Applied ${applied.length} migration(s)`);
      if (applied.length > 0) {
        for (const mig of applied) info(`  ${mig.version} ${mig.name}`);
      }
      client.close();
    });

  m.command('status')
    .description('Show applied and pending migrations')
    .option('--db <path>', 'SQLite database path')
    .action(async (opts) => {
      const path = resolveDbPath(opts.db);
      const client = createClient({ url: toLibsqlUrl(path) });
      const runner = new MigrationRunner(client, 'sqlite');
      const status = await runner.status();
      info(`applied: ${status.applied.length}`);
      info(`pending: ${status.pending.length}`);
      if (status.pending.length > 0) {
        for (const mig of status.pending) info(`  - ${mig.version} ${mig.name}`);
      }
      client.close();
    });

  m.command('down')
    .description('Roll back migrations (P0: not supported)')
    .option('--steps <n>', 'Number of migrations to roll back', '1')
    .action(async () => {
      warn('migrate down is not supported in P0 (forward-only). Restore from backup if needed.');
      process.exit(2);
    });
}
