// mcp-gateway redaction ... — PII/Secret Redaction management (P7)

import type { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { GatewayClient } from '../shared/client.js';
import { ok, error, exitWith } from '../shared/output.js';
import { formatOutput } from '../shared/table.js';

export function registerRedactionCommand(program: Command): void {
  const r = program.command('redaction').description('PII / secret redaction rules + findings');

  // ── rule ──────────────────────────────────────────────
  const rule = r.command('rule').description('Manage redaction rules');

  rule.command('list')
    .description('List redaction rules')
    .option('--built-in', 'Only list built-in rules')
    .option('--custom', 'Only list custom rules')
    .option('--gateway <url>').option('--gateway-token <token>')
    .option('--output <fmt>', 'json | table', 'json')
    .action(async (opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      const q = opts.builtIn ? '?builtIn=true' : opts.custom ? '?builtIn=false' : '';
      const res = await client.request<{ rules: unknown[] }>('GET', `/api/redaction/rules${q}`);
      console.log(formatOutput(res.rules as never, opts.output));
    });

  rule.command('add')
    .description('Create a custom redaction rule from a JSON config file')
    .requiredOption('-c, --config <path>')
    .option('--gateway <url>').option('--gateway-token <token>')
    .action(async (opts) => {
      const cfg = JSON.parse(readFileSync(opts.config, 'utf-8'));
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      try {
        const res = await client.request<{ id: string; name: string }>('POST', '/api/redaction/rules', cfg);
        ok(`Created rule ${res.id} (name=${res.name})`);
      } catch (e) { error((e as Error).message); exitWith(1); }
    });

  rule.command('update')
    .description('Update mode/enabled (built-in) or any field (custom)')
    .argument('<id>')
    .option('--mode <mode>', 'redact | block | warn')
    .option('--enabled <bool>', 'true | false')
    .option('--gateway <url>').option('--gateway-token <token>')
    .action(async (id: string, opts) => {
      const body: Record<string, unknown> = {};
      if (opts.mode) body.mode = opts.mode;
      if (opts.enabled !== undefined) body.enabled = opts.enabled === 'true';
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      try {
        await client.request('PATCH', `/api/redaction/rules/${encodeURIComponent(id)}`, body);
        ok(`Updated ${id}`);
      } catch (e) { error((e as Error).message); exitWith(1); }
    });

  rule.command('delete')
    .description('Delete a custom redaction rule')
    .argument('<id>')
    .option('--gateway <url>').option('--gateway-token <token>')
    .action(async (id: string, opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      try {
        await client.request('DELETE', `/api/redaction/rules/${encodeURIComponent(id)}`);
        ok(`Deleted ${id}`);
      } catch (e) { error((e as Error).message); exitWith(1); }
    });

  // ── test ──────────────────────────────────────────────
  r.command('test')
    .description('Test scan a text string against redaction rules')
    .requiredOption('--text <text>')
    .option('--rule-id <id>', 'Limit to a single rule id (repeatable)', collect, [])
    .option('--scope <scope>', 'request | response', 'request')
    .option('--gateway <url>').option('--gateway-token <token>')
    .action(async (opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      const body: Record<string, unknown> = { text: opts.text, scope: opts.scope };
      if (opts.ruleId && opts.ruleId.length > 0) body.ruleIds = opts.ruleId;
      const res = await client.request('POST', '/api/redaction/test', body);
      console.log(JSON.stringify(res, null, 2));
    });

  // ── findings ──────────────────────────────────────────
  r.command('findings')
    .description('Show recent redaction findings')
    .option('--since <duration>', 'Time window e.g. 1h, 24h, 7d', '24h')
    .option('--rule <ruleId>')
    .option('--server <name>')
    .option('--limit <n>', 'Max rows', '100')
    .option('--gateway <url>').option('--gateway-token <token>')
    .option('--output <fmt>', 'json | table', 'json')
    .action(async (opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      const qs = new URLSearchParams();
      if (opts.since) qs.set('since', opts.since);
      if (opts.rule) qs.set('ruleId', opts.rule);
      if (opts.server) qs.set('server', opts.server);
      qs.set('limit', String(opts.limit));
      const res = await client.request<{ findings: unknown[] }>('GET', `/api/redaction/findings?${qs.toString()}`);
      console.log(formatOutput(res.findings as never, opts.output));
    });
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}
