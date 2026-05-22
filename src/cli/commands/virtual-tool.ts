import { readFileSync } from 'node:fs';
import type { Command } from 'commander';
import { GatewayClient } from '../shared/client.js';
import { ok, error, exitWith } from '../shared/output.js';
import { formatOutput } from '../shared/table.js';

function readJsonFile(path: string): unknown {
  const raw = readFileSync(path, 'utf-8');
  try { return JSON.parse(raw); } catch (e) {
    throw new Error(`failed to parse JSON at ${path}: ${(e as Error).message}`);
  }
}

export function registerVirtualToolCommand(program: Command): void {
  const vt = program.command('virtual-tool').description('Tool composition / virtual tool management (P10)');

  vt.command('list')
    .description('List virtual tools')
    .option('--output <fmt>', 'json | table', 'json')
    .option('--gateway <url>').option('--gateway-token <token>')
    .action(async (opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      const r = await client.request<{ virtualTools: unknown[] }>('GET', '/api/virtual-tools');
      console.log(formatOutput(r.virtualTools as never, opts.output));
    });

  vt.command('create')
    .description('Create a virtual tool from a plan JSON file')
    .requiredOption('-c, --config <path>', 'Path to plan JSON file')
    .option('--gateway <url>').option('--gateway-token <token>')
    .action(async (opts) => {
      const plan = readJsonFile(opts.config);
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      try {
        const r = await client.request<{ canonicalName: string }>('POST', '/api/virtual-tools', plan);
        ok(`Created virtual tool '${r.canonicalName}'`);
      } catch (e) { error((e as Error).message); exitWith(1); }
    });

  vt.command('show')
    .description('Show virtual tool detail')
    .argument('<name>')
    .option('--gateway <url>').option('--gateway-token <token>')
    .action(async (name: string, opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      const r = await client.request('GET', `/api/virtual-tools/${encodeURIComponent(name)}`);
      console.log(JSON.stringify(r, null, 2));
    });

  vt.command('update')
    .description('Update a virtual tool plan from a JSON file')
    .argument('<name>')
    .requiredOption('-c, --config <path>', 'Path to plan JSON file')
    .option('--gateway <url>').option('--gateway-token <token>')
    .action(async (name: string, opts) => {
      const plan = readJsonFile(opts.config);
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      try {
        await client.request('PATCH', `/api/virtual-tools/${encodeURIComponent(name)}`, { plan });
        ok(`Updated '${name}'`);
      } catch (e) { error((e as Error).message); exitWith(1); }
    });

  vt.command('delete')
    .description('Delete a virtual tool')
    .argument('<name>')
    .option('--gateway <url>').option('--gateway-token <token>')
    .action(async (name: string, opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      try {
        await client.request('DELETE', `/api/virtual-tools/${encodeURIComponent(name)}`);
        ok(`Deleted '${name}'`);
      } catch (e) { error((e as Error).message); exitWith(1); }
    });

  vt.command('test')
    .description('Dry-run a virtual tool with given args')
    .argument('<name>')
    .requiredOption('--args <json>', 'JSON string of input arguments')
    .option('--gateway <url>').option('--gateway-token <token>')
    .action(async (name: string, opts) => {
      let args: unknown;
      try { args = JSON.parse(opts.args); }
      catch (e) { error(`invalid --args JSON: ${(e as Error).message}`); exitWith(2); }
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      try {
        const r = await client.request('POST', `/api/virtual-tools/${encodeURIComponent(name)}/test`, { args });
        console.log(JSON.stringify(r, null, 2));
      } catch (e) { error((e as Error).message); exitWith(1); }
    });

  vt.command('validate')
    .description('Validate a plan JSON file without persisting')
    .requiredOption('-c, --config <path>', 'Path to plan JSON file')
    .option('--gateway <url>').option('--gateway-token <token>')
    .action(async (opts) => {
      const plan = readJsonFile(opts.config);
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      try {
        const r = await client.request<{ ok: boolean; errors?: string[] }>(
          'POST', '/api/virtual-tools/validate', { plan },
        );
        if (r.ok) ok('Plan is valid');
        else { error('Plan invalid:'); for (const e of r.errors ?? []) console.error(`  - ${e}`); exitWith(1); }
      } catch (e) { error((e as Error).message); exitWith(1); }
    });
}
