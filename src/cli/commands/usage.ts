import type { Command } from 'commander';
import { GatewayClient } from '../shared/client.js';
import { formatOutput } from '../shared/table.js';

export function registerUsageCommand(program: Command): void {
  program.command('usage')
    .description('Show aggregated tool call usage')
    .option('--by <dim>', 'tool | principal | server', 'tool')
    .option('--since <ms>', 'epoch ms')
    .option('--until <ms>', 'epoch ms')
    .option('--gateway <url>', 'Gateway URL')
    .option('--gateway-token <token>', 'Access token')
    .option('--output <fmt>', 'json | table', 'table')
    .action(async (opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      const params = new URLSearchParams();
      params.set('by', opts.by);
      if (opts.since) params.set('since', opts.since);
      if (opts.until) params.set('until', opts.until);
      const r = await client.request<{ series: Array<Record<string, unknown>> }>('GET', `/api/usage?${params}`);
      console.log(formatOutput(r.series, opts.output));
    });
}
