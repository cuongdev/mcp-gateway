import type { Command } from 'commander';
import { GatewayClient } from '../shared/client.js';
import { ok, error, box, exitWith } from '../shared/output.js';

export function registerCreateMcpClientCommand(program: Command): void {
  program.command('create-mcp-client')
    .description('Provision a new MCP client + token')
    .argument('<name>', 'Client name')
    .option('--allow <servers>', 'Comma-separated allowed servers (or "*")', '*')
    .option('--description <text>', 'Description')
    .option('--gateway <url>', 'Gateway URL')
    .option('--gateway-token <token>', 'Admin token')
    .action(async (name: string, opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      const allowedServers = opts.allow.split(',').map((s: string) => s.trim()).filter(Boolean);
      try {
        const r = await client.request<{ principalId: string; token: string }>('POST', '/api/mcp-clients', {
          name,
          description: opts.description,
          allowedServers,
        });
        ok(`Created MCP client '${name}'`);
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
