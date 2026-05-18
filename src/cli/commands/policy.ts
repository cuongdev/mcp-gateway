import type { Command } from 'commander';
import { writeFileSync, readFileSync } from 'node:fs';
import { createStorage } from '../../storage/index.js';
import { ok } from '../shared/output.js';

function resolveDbPath(opt?: string): string {
  return opt ?? process.env.MCP_DB_PATH ?? './data/mcp.sqlite';
}

export function registerPolicyCommand(program: Command): void {
  const pol = program.command('policy').description('Casbin policy export / import');

  pol.command('export')
    .description('Export DB policies to CSV file')
    .option('--db <path>', 'SQLite db path')
    .option('--out <path>', 'Output file', './policy.export.csv')
    .action(async (opts) => {
      const storage = await createStorage({ driver: 'sqlite', path: resolveDbPath(opts.db) });
      const rows = await storage.policies.list();
      const csv = rows.map((r) => [r.ptype, ...r.values].join(', ')).join('\n');
      writeFileSync(opts.out, csv + '\n');
      ok(`Exported ${rows.length} policy rules to ${opts.out}`);
      await storage.close();
    });

  pol.command('import')
    .description('Replace DB policies with CSV content')
    .requiredOption('--from <path>', 'CSV file')
    .option('--db <path>', 'SQLite db path')
    .action(async (opts) => {
      const storage = await createStorage({ driver: 'sqlite', path: resolveDbPath(opts.db) });
      const csv = readFileSync(opts.from, 'utf-8');
      const rules: Array<{ ptype: string; values: string[] }> = [];
      for (const line of csv.split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const parts = t.split(',').map((s) => s.trim());
        if (parts.length < 2) continue;
        rules.push({ ptype: parts[0], values: parts.slice(1) });
      }
      await storage.policies.replaceAll(rules);
      ok(`Imported ${rules.length} policy rules`);
      await storage.close();
    });
}
