import type { Command } from 'commander';
import { GatewayClient } from '../shared/client.js';
import { ok, error, exitWith } from '../shared/output.js';
import { formatOutput } from '../shared/table.js';

export function registerApprovalCommand(program: Command): void {
  const a = program.command('approval').description('Approval workflow management');

  a.command('list')
    .description('List pending approvals')
    .option('--status <s>', 'pending|approved|rejected|expired', 'pending')
    .option('--gateway <url>')
    .option('--gateway-token <token>')
    .option('--output <fmt>', 'json | table', 'json')
    .action(async (opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      const r = await client.request<{ approvals: unknown[] }>('GET', `/api/approvals?status=${opts.status}`);
      console.log(formatOutput(r.approvals as never, opts.output));
    });

  a.command('approve')
    .description('Approve an approval id')
    .argument('<id>', 'Approval ID')
    .option('--reason <text>')
    .option('--gateway <url>')
    .option('--gateway-token <token>')
    .action(async (id: string, opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      try {
        await client.request('POST', `/api/approvals/${encodeURIComponent(id)}/approve`, { reason: opts.reason });
        ok(`Approved ${id}`);
      } catch (e) { error((e as Error).message); exitWith(1); }
    });

  a.command('reject')
    .description('Reject an approval id')
    .argument('<id>', 'Approval ID')
    .option('--reason <text>')
    .option('--gateway <url>')
    .option('--gateway-token <token>')
    .action(async (id: string, opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      try {
        await client.request('POST', `/api/approvals/${encodeURIComponent(id)}/reject`, { reason: opts.reason });
        ok(`Rejected ${id}`);
      } catch (e) { error((e as Error).message); exitWith(1); }
    });
}
