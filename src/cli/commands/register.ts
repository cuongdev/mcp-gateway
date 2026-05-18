import type { Command } from 'commander';
import { GatewayClient } from '../shared/client.js';
import { ok, exitWith } from '../shared/output.js';

export function registerRegisterCommand(program: Command): void {
  program.command('register')
    .description('Register a new MCP server with the gateway')
    .requiredOption('--name <name>', 'Server name (used in canonical tool naming)')
    .requiredOption('--url <url>', 'Server URL (for streamable-http transport)')
    .option('--token <token>', 'Bearer token for upstream auth')
    .option('--header <kv...>', 'Custom headers (k=v format)', collect, [] as string[])
    .option('--no-auto-discover', 'Skip tool discovery on register')
    .option('--gateway <url>', 'Gateway URL')
    .option('--gateway-token <token>', 'Gateway admin token')
    .action(async (opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      const headers: Record<string, string> = {};
      for (const kv of opts.header as string[]) {
        const [k, v] = kv.split('=');
        if (k && v !== undefined) headers[k] = v;
      }
      try {
        await client.request('POST', '/api/servers', {
          name: opts.name,
          transport: {
            type: 'streamable-http',
            url: opts.url,
            bearerToken: opts.token,
            headers,
          },
          autoDiscover: opts.autoDiscover !== false,
        });
        ok(`Registered server '${opts.name}'`);
      } catch (e) {
        exitWith(1, (e as Error).message);
      }
    });
}

function collect(value: string, acc: string[]): string[] {
  acc.push(value);
  return acc;
}
