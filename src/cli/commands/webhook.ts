import type { Command } from 'commander';
import { GatewayClient } from '../shared/client.js';
import { ok, error, exitWith } from '../shared/output.js';
import { formatOutput } from '../shared/table.js';

export function registerWebhookCommand(program: Command): void {
  const w = program.command('webhook').description('Webhook management');

  w.command('add')
    .description('Register a webhook')
    .requiredOption('--name <name>')
    .requiredOption('--url <url>')
    .option('--secret <secret>')
    .option('--events <events>', 'Comma-separated event names', '')
    .option('--gateway <url>').option('--gateway-token <token>')
    .action(async (opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      const events = opts.events ? opts.events.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
      try {
        const r = await client.request<{ id: string }>('POST', '/api/webhooks', {
          name: opts.name, url: opts.url, secret: opts.secret, events,
        });
        ok(`Created webhook ${r.id}`);
      } catch (e) { error((e as Error).message); exitWith(1); }
    });

  w.command('list')
    .option('--gateway <url>').option('--gateway-token <token>')
    .option('--output <fmt>', 'json | table', 'json')
    .action(async (opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      const r = await client.request<{ webhooks: unknown[] }>('GET', '/api/webhooks');
      console.log(formatOutput(r.webhooks as never, opts.output));
    });

  w.command('delete')
    .argument('<id>')
    .option('--gateway <url>').option('--gateway-token <token>')
    .action(async (id: string, opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      try {
        await client.request('DELETE', `/api/webhooks/${encodeURIComponent(id)}`);
        ok(`Deleted ${id}`);
      } catch (e) { error((e as Error).message); exitWith(1); }
    });
}
