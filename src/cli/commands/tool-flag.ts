import type { Command } from 'commander';
import { GatewayClient } from '../shared/client.js';
import { ok, error, exitWith } from '../shared/output.js';

export function registerToolFlagCommand(program: Command): void {
  const tool = program.command('tool').description('Tool flags');

  tool.command('flag')
    .description('Set cache flags on a tool')
    .argument('<name>', 'Canonical tool name (e.g. db__query)')
    .option('--cacheable', 'Mark cacheable')
    .option('--no-cacheable', 'Mark not cacheable')
    .option('--ttl <seconds>', 'Cache TTL in seconds', (v) => parseInt(v, 10))
    .option('--per-principal', 'Scope cache key per principal')
    .option('--no-per-principal', 'Share cache across principals')
    .option('--sensitive', 'Require approval')
    .option('--no-sensitive', 'Disable approval requirement')
    .option('--gateway <url>', 'Gateway URL')
    .option('--gateway-token <token>', 'Admin token')
    .action(async (name: string, opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      const body: Record<string, unknown> = {};
      if (opts.cacheable !== undefined) body.cacheable = opts.cacheable;
      if (opts.ttl !== undefined) body.cacheTtlSec = opts.ttl;
      if (opts.perPrincipal !== undefined) body.cachePerPrincipal = opts.perPrincipal;
      if (opts.sensitive !== undefined) body.sensitive = opts.sensitive;
      try {
        await client.request('PATCH', `/api/tools/${encodeURIComponent(name)}`, body);
        ok(`Updated cache flags on '${name}'`);
      } catch (e) {
        error((e as Error).message);
        exitWith(1);
      }
    });
}
