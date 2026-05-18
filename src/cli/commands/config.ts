import type { Command } from 'commander';
import { writeFileSync, readFileSync } from 'node:fs';
import { createStorage } from '../../storage/index.js';
import { ok } from '../shared/output.js';

function resolveDbPath(opt?: string): string {
  return opt ?? process.env.MCP_DB_PATH ?? './data/mcp.sqlite';
}

export function registerConfigCommand(program: Command): void {
  const cfg = program.command('config').description('Export / import gateway config');

  cfg.command('export')
    .description('Export current DB state to JSON config file')
    .option('--db <path>', 'SQLite db path')
    .option('--out <path>', 'Output file', './gateway.export.json')
    .action(async (opts) => {
      const storage = await createStorage({ driver: 'sqlite', path: resolveDbPath(opts.db) });
      const servers = (await storage.servers.list()).map((s) => ({
        name: s.name,
        transport: { type: s.transportType, ...s.transportConfig },
        autoDiscover: s.autoDiscover,
      }));
      const groups = (await storage.groups.list()).map((g) => ({
        name: g.name,
        description: g.description,
        tools: g.tools,
        includedServers: g.includedServers ?? [],
        excludedTools: g.excludedTools ?? [],
        allowedRoles: g.allowedRoles,
      }));
      writeFileSync(opts.out, JSON.stringify({ servers, groups }, null, 2));
      ok(`Exported ${servers.length} servers and ${groups.length} groups to ${opts.out}`);
      await storage.close();
    });

  cfg.command('import')
    .description('Import config from JSON file (replaces existing servers/groups)')
    .requiredOption('--from <path>', 'JSON file')
    .option('--db <path>', 'SQLite db path')
    .action(async (opts) => {
      const storage = await createStorage({ driver: 'sqlite', path: resolveDbPath(opts.db) });
      const data = JSON.parse(readFileSync(opts.from, 'utf-8')) as {
        servers?: Array<{ name: string; transport: { type: string; [k: string]: unknown }; autoDiscover?: boolean }>;
        groups?: Array<{ name: string; description?: string; tools?: string[]; includedServers?: string[]; excludedTools?: string[]; allowedRoles?: string[] }>;
      };
      let s = 0, g = 0;
      for (const sv of data.servers ?? []) {
        const { type, ...rest } = sv.transport;
        await storage.servers.upsert({
          name: sv.name,
          transportType: type as never,
          transportConfig: rest,
          autoDiscover: sv.autoDiscover !== false,
        });
        s++;
      }
      for (const gr of data.groups ?? []) {
        if (await storage.groups.findByName(gr.name)) await storage.groups.deleteByName(gr.name);
        await storage.groups.create({
          name: gr.name,
          description: gr.description ?? '',
          allowedRoles: gr.allowedRoles ?? [],
          tools: gr.tools ?? [],
        });
        if (gr.includedServers?.length) await storage.groups.setIncludedServers(gr.name, gr.includedServers);
        if (gr.excludedTools?.length) await storage.groups.setExcludedTools(gr.name, gr.excludedTools);
        g++;
      }
      ok(`Imported ${s} servers and ${g} groups`);
      await storage.close();
    });
}
