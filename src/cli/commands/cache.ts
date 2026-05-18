import type { Command } from 'commander';
import { GatewayClient } from '../shared/client.js';
import { ok, error, exitWith } from '../shared/output.js';

export function registerCacheCommand(program: Command): void {
  const cache = program.command('cache').description('Tool-call cache management');

  cache.command('invalidate')
    .description('Invalidate cache entries by tool or principal')
    .option('--tool <name>', 'Canonical tool name')
    .option('--principal <id>', 'Principal ID')
    .option('--gateway <url>', 'Gateway URL')
    .option('--gateway-token <token>', 'Admin token')
    .action(async (opts) => {
      if (!opts.tool && !opts.principal) {
        error('Must specify --tool or --principal');
        exitWith(2);
      }
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      try {
        const r = await client.request<{ invalidated: number }>('POST', '/api/cache/invalidate', {
          tool: opts.tool, principal: opts.principal,
        });
        ok(`Invalidated ${r.invalidated} entries`);
      } catch (e) { error((e as Error).message); exitWith(1); }
    });
}
