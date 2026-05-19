import type { Command } from 'commander';
import { GatewayClient } from '../shared/client.js';
import { ok, error, box, exitWith } from '../shared/output.js';
import { loadConfigFile } from '../shared/load-config.js';

export function registerCreateMcpClientCommand(program: Command): void {
  program.command('create-mcp-client')
    .description('Provision a new MCP client + token')
    .argument('[name]', 'Client name')
    .option('--allow <servers>', 'Comma-separated allowed servers (or "*")', '*')
    .option('--description <text>', 'Description')
    .option('-c, --config <path>', 'JSON config file with name + allowedServers')
    .option('--gateway <url>', 'Gateway URL')
    .option('--gateway-token <token>', 'Admin token')
    .action(async (nameArg: string | undefined, opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      let postBody: Record<string, unknown>;
      if (opts.config) {
        postBody = loadConfigFile<Record<string, unknown>>(opts.config);
        // MCPJungle uses {name, allowed_servers}; we map to {name, allowedServers}
        if ('allowed_servers' in postBody && !('allowedServers' in postBody)) {
          postBody.allowedServers = postBody.allowed_servers;
          delete postBody.allowed_servers;
        }
      } else {
        if (!nameArg) {
          error('Either provide a <name> argument or use -c <config-file>');
          exitWith(1);
          return;
        }
        const allowedServers = opts.allow.split(',').map((s: string) => s.trim()).filter(Boolean);
        postBody = { name: nameArg, description: opts.description, allowedServers };
      }
      const clientName = (postBody.name as string | undefined) ?? nameArg ?? '<unnamed>';
      const allowedServers = Array.isArray(postBody.allowedServers)
        ? (postBody.allowedServers as string[])
        : [String(postBody.allowedServers ?? '*')];
      try {
        const r = await client.request<{ principalId: string; token: string }>('POST', '/api/mcp-clients', postBody);
        ok(`Created MCP client '${clientName}'`);
        box('CLIENT TOKEN — save this; will not be shown again', [
          r.token,
          '',
          `Principal ID: ${r.principalId}`,
          `Allowed servers: ${allowedServers.join(', ')}`,
        ]);
      } catch (e) {
        error((e as Error).message);
        exitWith(1);
      }
    });
}
