import type { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { createStorage } from '../../storage/index.js';
import { ok, info, error, exitWith } from '../shared/output.js';

interface ConfigJson {
  servers?: Array<{
    name: string;
    transport: { type: 'streamable-http' | 'stdio' | 'sse'; [k: string]: unknown };
    autoDiscover?: boolean;
  }>;
  groups?: Array<{
    name: string;
    description?: string;
    tools?: string[];
    allowedRoles?: string[];
  }>;
}

function resolveDbPath(opt?: string): string {
  return opt ?? process.env.MCP_DB_PATH ?? './data/mcp.sqlite';
}

function parsePolicyCsv(content: string): Array<{ ptype: string; values: string[] }> {
  const out: Array<{ ptype: string; values: string[] }> = [];
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(',').map((p) => p.trim());
    if (parts.length < 2) continue;
    const [ptype, ...values] = parts;
    out.push({ ptype, values });
  }
  return out;
}

export function registerSeedCommand(program: Command): void {
  // The 'migrate' command was registered by registerMigrateCommands (Task 19).
  // Find it and add the 'seed' subcommand. Fall back to creating it if not present.
  const migrate = program.commands.find((c) => c.name() === 'migrate')
    ?? program.command('migrate').description('Database schema migrations');

  migrate.command('seed')
    .description('One-time seed: import servers, groups, and policies from files')
    .requiredOption('--from <path>', 'Path to gateway.config.json')
    .option('--policy <path>', 'Path to policy.csv')
    .option('--force', 'Overwrite existing data')
    .option('--db <path>', 'SQLite database path')
    .action(async (opts) => {
      const dbPath = resolveDbPath(opts.db);
      const storage = await createStorage({ driver: 'sqlite', path: dbPath });

      const hasServers = (await storage.servers.list()).length > 0;
      const hasGroups = (await storage.groups.list()).length > 0;
      const hasPolicies = (await storage.policies.list()).length > 0;
      if ((hasServers || hasGroups || hasPolicies) && !opts.force) {
        error('Database already seeded. Use --force to overwrite.');
        await storage.close();
        exitWith(2);
      }

      const cfg = JSON.parse(readFileSync(opts.from, 'utf-8')) as ConfigJson;
      let serverCount = 0;
      for (const s of cfg.servers ?? []) {
        const { type, ...rest } = s.transport;
        await storage.servers.upsert({
          name: s.name,
          transportType: type,
          transportConfig: rest,
          autoDiscover: s.autoDiscover !== false,
        });
        serverCount++;
      }
      ok(`Seeded ${serverCount} server(s)`);

      // Pre-delete groups (with FK ON so CASCADE removes group_tools rows).
      if (opts.force) {
        for (const g of cfg.groups ?? []) {
          await storage.groups.deleteByName(g.name);
        }
      }
      // Disable FK enforcement while inserting group_tools: tools reference
      // tools(canonical_name) but tools are discovered at runtime, not seeded.
      await storage.execute('PRAGMA foreign_keys=OFF');
      let groupCount = 0;
      for (const g of cfg.groups ?? []) {
        await storage.groups.create({
          name: g.name,
          description: g.description ?? '',
          allowedRoles: g.allowedRoles ?? [],
          tools: g.tools ?? [],
        });
        groupCount++;
      }
      await storage.execute('PRAGMA foreign_keys=ON');
      ok(`Seeded ${groupCount} group(s)`);

      let policyCount = 0;
      if (opts.policy) {
        const policy = parsePolicyCsv(readFileSync(opts.policy, 'utf-8'));
        if (opts.force) await storage.policies.replaceAll(policy);
        else {
          for (const p of policy) await storage.policies.append(p);
        }
        policyCount = policy.length;
      }
      ok(`Seeded ${policyCount} policy rule(s)`);

      info('Seed complete. Run `mcp-gateway init-server` to create the admin token if not yet done.');
      await storage.close();
    });
}
