// ============================================================
// CLI: mcp-gateway catalog ...
//
// Mirrors `src/cli/commands/proxy.ts` shape. Talks to the
// gateway over the admin REST API (`/api/catalog/*`).
// ============================================================

import type { Command } from 'commander';
import { GatewayClient } from '../shared/client.js';
import { ok, error, exitWith, info } from '../shared/output.js';
import { formatOutput } from '../shared/table.js';

function collect(value: string, acc: string[]): string[] {
  acc.push(value);
  return acc;
}

function parseEnvList(entries: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of entries) {
    const idx = raw.indexOf('=');
    if (idx <= 0) {
      throw new Error(`Invalid --env value '${raw}'; expected KEY=VALUE`);
    }
    out[raw.slice(0, idx)] = raw.slice(idx + 1);
  }
  return out;
}

export function registerCatalogCommand(program: Command): void {
  const c = program.command('catalog').description('Connector catalog management (P9)');

  c.command('list')
    .description('List available connector templates')
    .option('--category <name>', 'Filter by category')
    .option('--gateway <url>').option('--gateway-token <token>')
    .option('--output <fmt>', 'json | table', 'json')
    .action(async (opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      const path = opts.category
        ? `/api/catalog/connectors?category=${encodeURIComponent(opts.category)}`
        : '/api/catalog/connectors';
      try {
        const r = await client.request<{ connectors: Array<Record<string, unknown>> }>(
          'GET', path,
        );
        if (opts.output === 'table') {
          const rows = r.connectors.map((t) => ({
            id: t.id,
            displayName: t.displayName,
            category: t.category,
            version: t.templateVersion,
          }));
          console.log(formatOutput(rows as never, 'table'));
        } else {
          console.log(formatOutput(r.connectors as never, 'json'));
        }
      } catch (e) { error((e as Error).message); exitWith(1); }
    });

  c.command('show')
    .description('Show a connector template by id')
    .argument('<connector-id>')
    .option('--gateway <url>').option('--gateway-token <token>')
    .action(async (id: string, opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      try {
        const r = await client.request(
          'GET', `/api/catalog/connectors/${encodeURIComponent(id)}`,
        );
        console.log(JSON.stringify(r, null, 2));
      } catch (e) { error((e as Error).message); exitWith(1); }
    });

  c.command('install')
    .description('Install a connector template into the gateway')
    .argument('<connector-id>')
    .requiredOption('--name <server>', 'Server name to register')
    .option('--env <kv...>', 'KEY=VALUE (repeatable)', collect, [] as string[])
    .option('--arg <kv...>', 'Template arg KEY=VALUE (repeatable)', collect, [] as string[])
    .option('--no-auto-discover', 'Skip tool discovery after registration')
    .option('--proxy-name <name>', 'Attach an outbound proxy by name')
    .option('--gateway <url>').option('--gateway-token <token>')
    .action(async (connectorId: string, opts) => {
      let env: Record<string, string>;
      let args: Record<string, string>;
      try {
        env = parseEnvList(opts.env ?? []);
        args = parseEnvList(opts.arg ?? []);
      } catch (e) { error((e as Error).message); exitWith(2); }

      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      const body: Record<string, unknown> = {
        connectorId,
        name: opts.name,
        env,
      };
      if (Object.keys(args).length > 0) body.args = args;
      const options: Record<string, unknown> = {};
      if (opts.autoDiscover === false) options.autoDiscover = false;
      if (opts.proxyName) options.proxyName = opts.proxyName;
      if (Object.keys(options).length > 0) body.options = options;

      try {
        const r = await client.request<{
          server: string;
          capabilitiesDiscovered: number;
          templateVersion: string;
        }>('POST', '/api/catalog/install', body);
        ok(`Installed ${connectorId} as '${r.server}' (template v${r.templateVersion})`);
        info(`Discovered ${r.capabilitiesDiscovered} capability/ies`);
      } catch (e) { error((e as Error).message); exitWith(1); }
    });

  c.command('installed')
    .description('List installed connectors')
    .option('--gateway <url>').option('--gateway-token <token>')
    .option('--output <fmt>', 'json | table', 'json')
    .action(async (opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      try {
        const r = await client.request<{ installs: Array<Record<string, unknown>> }>(
          'GET', '/api/catalog/installs',
        );
        if (opts.output === 'table') {
          const rows = r.installs.map((row) => ({
            id: row.id,
            connector: row.connectorId,
            server: row.serverName,
            version: row.templateVersion,
            update: row.updateAvailable ? 'yes' : 'no',
          }));
          console.log(formatOutput(rows as never, 'table'));
        } else {
          console.log(formatOutput(r.installs as never, 'json'));
        }
      } catch (e) { error((e as Error).message); exitWith(1); }
    });

  c.command('uninstall')
    .description('Uninstall a connector by server name')
    .argument('<server>')
    .option('--gateway <url>').option('--gateway-token <token>')
    .action(async (serverName: string, opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      try {
        // Look up the install id by server name first.
        const list = await client.request<{
          installs: Array<{ id: string; serverName: string }>;
        }>('GET', '/api/catalog/installs');
        const match = list.installs.find((row) => row.serverName === serverName);
        if (!match) {
          error(`No install found for server '${serverName}'`);
          exitWith(1);
        }
        await client.request('DELETE', `/api/catalog/installs/${encodeURIComponent(match.id)}`);
        ok(`Uninstalled ${serverName}`);
      } catch (e) { error((e as Error).message); exitWith(1); }
    });
}
