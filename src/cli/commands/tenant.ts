import type { Command } from 'commander';
import { GatewayClient } from '../shared/client.js';
import { ok, error, exitWith } from '../shared/output.js';
import { formatOutput } from '../shared/table.js';

export function registerTenantCommand(program: Command): void {
  const t = program.command('tenant').description('Tenant management (system admin)');

  t.command('create')
    .description('Create a new tenant')
    .argument('<slug>', 'Tenant slug (lowercase alphanumeric/hyphen)')
    .option('--name <displayName>', 'Display name (defaults to slug)')
    .option('--plan <plan>', 'Plan name', 'free')
    .option('--gateway <url>').option('--gateway-token <token>')
    .action(async (slug: string, opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      try {
        const r = await client.request<{ id: string; slug: string }>('POST', '/api/system/tenants', {
          slug, displayName: opts.name ?? slug, plan: opts.plan,
        });
        ok(`Created tenant ${r.id} (slug=${r.slug})`);
      } catch (e) { error((e as Error).message); exitWith(1); }
    });

  t.command('list')
    .description('List tenants')
    .option('--gateway <url>').option('--gateway-token <token>')
    .option('--output <fmt>', 'json | table', 'json')
    .action(async (opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      const r = await client.request<{ tenants: unknown[] }>('GET', '/api/system/tenants');
      console.log(formatOutput(r.tenants as never, opts.output));
    });

  t.command('suspend')
    .description('Suspend a tenant (returns 402 for its requests)')
    .argument('<id>', 'Tenant ID (tnt_…)')
    .option('--gateway <url>').option('--gateway-token <token>')
    .action(async (id: string, opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      try {
        await client.request('POST', `/api/system/tenants/${encodeURIComponent(id)}/suspend`);
        ok(`Suspended ${id}`);
      } catch (e) { error((e as Error).message); exitWith(1); }
    });

  t.command('resume')
    .description('Resume a suspended tenant')
    .argument('<id>', 'Tenant ID (tnt_…)')
    .option('--gateway <url>').option('--gateway-token <token>')
    .action(async (id: string, opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      try {
        await client.request('POST', `/api/system/tenants/${encodeURIComponent(id)}/resume`);
        ok(`Resumed ${id}`);
      } catch (e) { error((e as Error).message); exitWith(1); }
    });
}
