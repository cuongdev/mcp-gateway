import type { Command } from 'commander';
import { GatewayClient } from '../shared/client.js';
import { formatOutput } from '../shared/table.js';

export function registerRateLimitCommand(program: Command): void {
  const rl = program.command('rate-limit').description('Rate-limit inspection');
  rl.command('show')
    .description('Show effective rate-limit configuration')
    .option('--gateway <url>', 'Gateway URL')
    .option('--gateway-token <token>', 'Admin token')
    .option('--output <fmt>', 'json | table', 'json')
    .action(async (opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      const r = await client.request<unknown>('GET', '/api/rate-limit/status');
      console.log(formatOutput(r as never, opts.output));
    });
}
