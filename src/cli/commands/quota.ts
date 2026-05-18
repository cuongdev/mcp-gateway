import type { Command } from 'commander';
import { GatewayClient } from '../shared/client.js';
import { formatOutput } from '../shared/table.js';

export function registerQuotaCommand(program: Command): void {
  const q = program.command('quota').description('Quota inspection (set via config or admin endpoint)');

  q.command('status')
    .description('Show current quota status for the caller')
    .option('--gateway <url>', 'Gateway URL')
    .option('--gateway-token <token>', 'Your access token')
    .option('--output <fmt>', 'json | table', 'json')
    .action(async (opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      const r = await client.request<unknown>('GET', '/api/quota/status');
      console.log(formatOutput(r as never, opts.output));
    });
}
