import type { Command } from 'commander';
import { GatewayClient } from '../shared/client.js';
import { ok, error, exitWith } from '../shared/output.js';
import { loadConfigFile } from '../shared/load-config.js';

export function registerCreateGroupCommand(program: Command): void {
  program.command('create-group')
    .description('Create a tool group')
    .argument('[name]', 'Group name')
    .option('--description <text>', '', '')
    .option('--tools <names>', 'Comma-separated canonical tool names', '')
    .option('--include-servers <names>', 'Comma-separated server names whose tools to include', '')
    .option('--exclude-tools <names>', 'Comma-separated canonical tools to exclude', '')
    .option('--allowed-roles <roles>', 'Comma-separated allowed Casbin roles', '')
    .option('-c, --config <path>', 'JSON config file for the group')
    .option('--gateway <url>', 'Gateway URL')
    .option('--gateway-token <token>', 'Admin token')
    .action(async (nameArg: string | undefined, opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      const split = (s: string) => s ? s.split(',').map((p: string) => p.trim()).filter(Boolean) : [];
      let postBody: Record<string, unknown>;
      if (opts.config) {
        postBody = loadConfigFile<Record<string, unknown>>(opts.config);
        // Map MCPJungle's snake_case field names to our camelCase equivalents
        if ('included_tools' in postBody && !('tools' in postBody)) {
          postBody.tools = postBody.included_tools;
          delete postBody.included_tools;
        }
        if ('included_servers' in postBody && !('includedServers' in postBody)) {
          postBody.includedServers = postBody.included_servers;
          delete postBody.included_servers;
        }
        if ('excluded_tools' in postBody && !('excludedTools' in postBody)) {
          postBody.excludedTools = postBody.excluded_tools;
          delete postBody.excluded_tools;
        }
      } else {
        if (!nameArg) {
          error('Either provide a [name] argument or use -c <config-file>');
          exitWith(1);
          return;
        }
        postBody = {
          name: nameArg,
          description: opts.description,
          tools: split(opts.tools),
          includedServers: split(opts.includeServers),
          excludedTools: split(opts.excludeTools),
          allowedRoles: split(opts.allowedRoles),
        };
      }
      const groupName = (postBody.name as string | undefined) ?? nameArg ?? '<unnamed>';
      try {
        await client.request('POST', '/api/groups', postBody);
        ok(`Created group '${groupName}'`);
      } catch (e) {
        error((e as Error).message);
        exitWith(1);
      }
    });
}
