import type { Command } from 'commander';
import { GatewayClient } from '../shared/client.js';
import { formatOutput } from '../shared/table.js';
import { exitWith } from '../shared/output.js';

export function registerListCommand(program: Command): void {
  const KINDS = ['servers', 'tools', 'prompts', 'groups', 'mcp-clients', 'users'] as const;
  program.command('list')
    .description('List gateway resources')
    .argument('<kind>', `One of: ${KINDS.join(', ')}`)
    .option('--gateway <url>', 'Gateway URL')
    .option('--gateway-token <token>', 'Gateway admin token')
    .option('--output <fmt>', 'json | table', 'table')
    .action(async (kind: string, opts) => {
      if (!KINDS.includes(kind as typeof KINDS[number])) {
        exitWith(2, `Unknown kind '${kind}'. Use one of: ${KINDS.join(', ')}`);
      }
      const path = `/api/${kind}`;
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      try {
        const body = await client.request<Record<string, unknown[]>>('GET', path);
        const rows = body[kind] ?? body[Object.keys(body)[0]] ?? [];
        console.log(formatOutput(rows, opts.output));
      } catch (e) {
        exitWith(1, (e as Error).message);
      }
    });
}
