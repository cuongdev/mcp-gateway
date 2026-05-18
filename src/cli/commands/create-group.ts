import type { Command } from 'commander';
import { GatewayClient } from '../shared/client.js';
import { ok, error, exitWith } from '../shared/output.js';

export function registerCreateGroupCommand(program: Command): void {
  program.command('create-group')
    .description('Create a tool group')
    .argument('<name>', 'Group name')
    .option('--description <text>', '', '')
    .option('--tools <names>', 'Comma-separated canonical tool names', '')
    .option('--include-servers <names>', 'Comma-separated server names whose tools to include', '')
    .option('--exclude-tools <names>', 'Comma-separated canonical tools to exclude', '')
    .option('--allowed-roles <roles>', 'Comma-separated allowed Casbin roles', '')
    .option('--gateway <url>', 'Gateway URL')
    .option('--gateway-token <token>', 'Admin token')
    .action(async (name: string, opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      const split = (s: string) => s ? s.split(',').map((p: string) => p.trim()).filter(Boolean) : [];
      try {
        await client.request('POST', '/api/groups', {
          name,
          description: opts.description,
          tools: split(opts.tools),
          includedServers: split(opts.includeServers),
          excludedTools: split(opts.excludeTools),
          allowedRoles: split(opts.allowedRoles),
        });
        ok(`Created group '${name}'`);
      } catch (e) {
        error((e as Error).message);
        exitWith(1);
      }
    });
}
