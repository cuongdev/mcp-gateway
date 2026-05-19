import type { Command } from 'commander';
import { GatewayClient } from '../shared/client.js';
import { ok, error, exitWith } from '../shared/output.js';
import { formatOutput } from '../shared/table.js';

export function registerProxyCommand(program: Command): void {
  const p = program.command('proxy').description('Outbound proxy management');

  p.command('add')
    .description('Register a new outbound proxy')
    .requiredOption('--name <name>')
    .requiredOption('--url <url>', 'http://, https://, or socks5:// URL with optional inline creds')
    .option('--description <text>')
    .option('--gateway <url>').option('--gateway-token <token>')
    .action(async (opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      try {
        const r = await client.request<{ id: string; name: string }>('POST', '/api/proxies', {
          name: opts.name, url: opts.url, description: opts.description,
        });
        ok(`Created proxy ${r.id} (name=${r.name})`);
      } catch (e) { error((e as Error).message); exitWith(1); }
    });

  p.command('list')
    .description('List all proxies')
    .option('--gateway <url>').option('--gateway-token <token>')
    .option('--output <fmt>', 'json | table', 'json')
    .action(async (opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      const r = await client.request<{ proxies: unknown[] }>('GET', '/api/proxies');
      console.log(formatOutput(r.proxies as never, opts.output));
    });

  p.command('show')
    .description('Show proxy detail (password redacted)')
    .argument('<id>')
    .option('--gateway <url>').option('--gateway-token <token>')
    .action(async (id: string, opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      const r = await client.request('GET', `/api/proxies/${encodeURIComponent(id)}`);
      console.log(JSON.stringify(r, null, 2));
    });

  p.command('update')
    .description('Update proxy URL / description / enabled')
    .argument('<id>')
    .option('--url <url>')
    .option('--description <text>')
    .option('--enabled <bool>', 'true | false')
    .option('--gateway <url>').option('--gateway-token <token>')
    .action(async (id: string, opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      const body: Record<string, unknown> = {};
      if (opts.url) body.url = opts.url;
      if (opts.description) body.description = opts.description;
      if (opts.enabled !== undefined) body.enabled = opts.enabled === 'true';
      try {
        await client.request('PATCH', `/api/proxies/${encodeURIComponent(id)}`, body);
        ok(`Updated ${id}`);
      } catch (e) { error((e as Error).message); exitWith(1); }
    });

  p.command('delete')
    .description('Delete proxy (use --force to cascade-detach references)')
    .argument('<id>')
    .option('--force', 'Force delete even when in use; references will be nullified')
    .option('--gateway <url>').option('--gateway-token <token>')
    .action(async (id: string, opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      const path = `/api/proxies/${encodeURIComponent(id)}${opts.force ? '?force=true' : ''}`;
      try {
        const r = await client.request<{ ok: boolean; detached?: Array<{ kind: string; name: string }> }>('DELETE', path);
        if (r.detached && r.detached.length > 0) {
          ok(`Deleted ${id} and detached ${r.detached.length} references`);
          for (const d of r.detached) console.log(`  - ${d.kind}: ${d.name}`);
        } else {
          ok(`Deleted ${id}`);
        }
      } catch (e) { error((e as Error).message); exitWith(1); }
    });

  p.command('attach')
    .description('Attach a proxy to a server or group')
    .option('--server <name>', 'Server name')
    .option('--group <name>', 'Group name')
    .requiredOption('--proxy <proxyName>', 'Proxy name to attach')
    .option('--gateway <url>').option('--gateway-token <token>')
    .action(async (opts) => {
      if (!opts.server && !opts.group) { error('Specify --server or --group'); exitWith(2); }
      if (opts.server && opts.group) { error('Specify only one of --server / --group'); exitWith(2); }
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      const target = opts.server
        ? `/api/servers/${encodeURIComponent(opts.server)}`
        : `/api/groups/${encodeURIComponent(opts.group)}`;
      try {
        await client.request('PATCH', target, { proxyName: opts.proxy });
        ok(`Attached proxy '${opts.proxy}' to ${opts.server ? 'server' : 'group'} '${opts.server ?? opts.group}'`);
      } catch (e) { error((e as Error).message); exitWith(1); }
    });

  p.command('detach')
    .description('Detach proxy from a server or group (sets proxyName to null)')
    .option('--server <name>')
    .option('--group <name>')
    .option('--gateway <url>').option('--gateway-token <token>')
    .action(async (opts) => {
      if (!opts.server && !opts.group) { error('Specify --server or --group'); exitWith(2); }
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      const target = opts.server
        ? `/api/servers/${encodeURIComponent(opts.server)}`
        : `/api/groups/${encodeURIComponent(opts.group)}`;
      try {
        await client.request('PATCH', target, { proxyName: null });
        ok(`Detached proxy from ${opts.server ? 'server' : 'group'} '${opts.server ?? opts.group}'`);
      } catch (e) { error((e as Error).message); exitWith(1); }
    });
}
