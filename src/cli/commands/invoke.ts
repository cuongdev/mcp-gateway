import type { Command } from 'commander';
import { GatewayClient } from '../shared/client.js';
import { error, exitWith } from '../shared/output.js';

export function registerInvokeCommand(program: Command): void {
  program.command('invoke')
    .description('Invoke a tool by canonical name')
    .argument('<canonicalName>', 'e.g. db__query_data')
    .option('--args <json>', 'JSON arguments', '{}')
    .option('--gateway <url>', 'Gateway URL')
    .option('--gateway-token <token>', 'Gateway access token')
    .action(async (canonicalName: string, opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      let args: unknown;
      try { args = JSON.parse(opts.args); } catch {
        error(`Invalid --args JSON: ${opts.args}`);
        exitWith(2);
      }
      try {
        const result = await client.request('POST', '/mcp', {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: canonicalName, arguments: args },
        });
        console.log(JSON.stringify(result, null, 2));
      } catch (e) {
        error((e as Error).message);
        exitWith(1);
      }
    });
}
