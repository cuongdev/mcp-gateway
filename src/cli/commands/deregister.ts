import type { Command } from 'commander';
import { GatewayClient } from '../shared/client.js';
import { ok, exitWith } from '../shared/output.js';

export function registerDeregisterCommand(program: Command): void {
  program.command('deregister')
    .description('Deregister an MCP server')
    .argument('<name>', 'Server name')
    .option('--gateway <url>', 'Gateway URL')
    .option('--gateway-token <token>', 'Gateway admin token')
    .action(async (name, opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      try {
        await client.request('DELETE', `/api/servers/${encodeURIComponent(name)}`);
        ok(`Deregistered server '${name}'`);
      } catch (e) {
        exitWith(1, (e as Error).message);
      }
    });
}
