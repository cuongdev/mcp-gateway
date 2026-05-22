// ============================================================
// `mcp-gateway circuit` — Circuit-breaker management CLI (P6)
//
//   mcp-gateway circuit status [--server X] [--output json|table]
//   mcp-gateway circuit trip <server> [--reason "..."]
//   mcp-gateway circuit close <server>
//   mcp-gateway circuit reset <server>
//   mcp-gateway circuit config <server>
//     [--error-rate 0.5] [--window 20] [--cooldown 30s]
//     [--consecutive-errors 5] [--half-open-probes 1]
//     [--quarantine-after 3] [--warmup 5] [--probe-method tools/list]
//   mcp-gateway circuit defaults [--show | <same flags as config>]
// ============================================================

import type { Command } from 'commander';
import { GatewayClient } from '../shared/client.js';
import { ok, error, exitWith } from '../shared/output.js';
import { formatOutput } from '../shared/table.js';

/**
 * Parse durations like "30s", "5m", "200ms", or a bare millisecond number.
 * Returns milliseconds. Throws if the input is unparseable.
 */
function parseDuration(input: string): number {
  const trimmed = input.trim().toLowerCase();
  const m = trimmed.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h)?$/);
  if (!m) throw new Error(`invalid duration '${input}' (expected like '30s', '5m', '200ms')`);
  const n = Number(m[1]);
  switch (m[2]) {
    case undefined:
    case 'ms':
      return Math.round(n);
    case 's':
      return Math.round(n * 1000);
    case 'm':
      return Math.round(n * 60_000);
    case 'h':
      return Math.round(n * 3_600_000);
  }
  throw new Error(`invalid duration unit in '${input}'`);
}

function buildConfigPatch(opts: Record<string, string | undefined>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (opts.errorRate !== undefined) patch.errorRateThreshold = Number(opts.errorRate);
  if (opts.window !== undefined) patch.windowSize = parseInt(opts.window, 10);
  if (opts.cooldown !== undefined) patch.cooldownMs = parseDuration(opts.cooldown);
  if (opts.consecutiveErrors !== undefined) patch.consecutiveErrorsToTrip = parseInt(opts.consecutiveErrors, 10);
  if (opts.halfOpenProbes !== undefined) patch.halfOpenProbes = parseInt(opts.halfOpenProbes, 10);
  if (opts.quarantineAfter !== undefined) patch.quarantineAfterReopens = parseInt(opts.quarantineAfter, 10);
  if (opts.warmup !== undefined) patch.warmupCalls = parseInt(opts.warmup, 10);
  if (opts.probeMethod !== undefined) patch.probeMethod = opts.probeMethod;
  return patch;
}

export function registerCircuitCommand(program: Command): void {
  const c = program.command('circuit').description('Per-server circuit breaker management');

  c.command('status')
    .description('Show status of one or all circuits')
    .option('--server <name>', 'Show only this server')
    .option('--output <fmt>', 'json | table', 'table')
    .option('--gateway <url>').option('--gateway-token <token>')
    .action(async (opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      try {
        if (opts.server) {
          const r = await client.request<{ circuit: Record<string, unknown> }>(
            'GET', `/api/circuits/${encodeURIComponent(opts.server)}`,
          );
          console.log(JSON.stringify(r.circuit, null, 2));
        } else {
          const r = await client.request<{ circuits: Array<Record<string, unknown>> }>(
            'GET', '/api/circuits',
          );
          if (opts.output === 'table') {
            const rows = r.circuits.map((h) => ({
              server: h.serverName as string,
              state: h.state as string,
              consecutiveErrors: h.consecutiveErrors as number,
              reopens: h.reopenCount as number,
              lastReason: (h.lastTransitionReason as string) ?? '-',
            }));
            console.log(formatOutput(rows, 'table'));
          } else {
            console.log(formatOutput(r.circuits as never, 'json'));
          }
        }
      } catch (e) { error((e as Error).message); exitWith(1); }
    });

  c.command('trip')
    .description('Manually trip the circuit on a server')
    .argument('<server>')
    .option('--reason <text>', 'Reason for the trip', 'manual trip via CLI')
    .option('--gateway <url>').option('--gateway-token <token>')
    .action(async (server: string, opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      try {
        await client.request('POST', `/api/circuits/${encodeURIComponent(server)}/trip`, { reason: opts.reason });
        ok(`Tripped circuit for ${server}`);
      } catch (e) { error((e as Error).message); exitWith(1); }
    });

  c.command('close')
    .description('Manually close (force-recover) the circuit on a server')
    .argument('<server>')
    .option('--reason <text>', 'Reason for closing', 'manual close via CLI')
    .option('--gateway <url>').option('--gateway-token <token>')
    .action(async (server: string, opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      try {
        await client.request('POST', `/api/circuits/${encodeURIComponent(server)}/close`, { reason: opts.reason });
        ok(`Closed circuit for ${server}`);
      } catch (e) { error((e as Error).message); exitWith(1); }
    });

  c.command('reset')
    .description('Reset the circuit on a server (clear rolling window and reopen counter)')
    .argument('<server>')
    .option('--gateway <url>').option('--gateway-token <token>')
    .action(async (server: string, opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      try {
        await client.request('POST', `/api/circuits/${encodeURIComponent(server)}/reset`);
        ok(`Reset circuit for ${server}`);
      } catch (e) { error((e as Error).message); exitWith(1); }
    });

  c.command('config')
    .description('Update per-server circuit config (partial; only provided fields change)')
    .argument('<server>')
    .option('--error-rate <ratio>', '0..1 — trip when rolling window exceeds this')
    .option('--window <n>', 'rolling window size (calls)')
    .option('--cooldown <duration>', "cooldown before half-open probe (e.g. '30s', '5m')")
    .option('--consecutive-errors <n>', 'consecutive errors required to trip')
    .option('--half-open-probes <n>', 'concurrent probes allowed in half-open')
    .option('--quarantine-after <n>', 'reopens required before quarantine')
    .option('--warmup <n>', 'calls during warmup that never cause a transition')
    .option('--probe-method <method>', "MCP method used for probes (default 'tools/list')")
    .option('--gateway <url>').option('--gateway-token <token>')
    .action(async (server: string, opts) => {
      try {
        const patch = buildConfigPatch(opts);
        if (Object.keys(patch).length === 0) { error('no config fields supplied'); exitWith(2); }
        const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
        await client.request('PATCH', `/api/circuits/${encodeURIComponent(server)}/config`, patch);
        ok(`Updated circuit config for ${server}`);
      } catch (e) { error((e as Error).message); exitWith(1); }
    });

  c.command('defaults')
    .description('Show or update the gateway-wide default circuit config')
    .option('--show', 'Just show the current defaults')
    .option('--error-rate <ratio>').option('--window <n>')
    .option('--cooldown <duration>').option('--consecutive-errors <n>')
    .option('--half-open-probes <n>').option('--quarantine-after <n>')
    .option('--warmup <n>').option('--probe-method <method>')
    .option('--gateway <url>').option('--gateway-token <token>')
    .action(async (opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      try {
        const patch = buildConfigPatch(opts);
        if (opts.show || Object.keys(patch).length === 0) {
          const r = await client.request<{ defaults: Record<string, unknown> }>('GET', '/api/circuits/config/defaults');
          console.log(JSON.stringify(r.defaults, null, 2));
          return;
        }
        const r = await client.request<{ defaults: Record<string, unknown> }>('PATCH', '/api/circuits/config/defaults', patch);
        ok('Updated defaults');
        console.log(JSON.stringify(r.defaults, null, 2));
      } catch (e) { error((e as Error).message); exitWith(1); }
    });
}
