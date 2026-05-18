import type { Command } from 'commander';
import { GatewayClient } from '../shared/client.js';
import { ok, error, exitWith } from '../shared/output.js';

export function registerRegisterCommand(program: Command): void {
  program.command('register')
    .description('Register a new MCP server with the gateway')
    .requiredOption('--name <name>', 'Server name (used in canonical tool naming)')
    // --url is optional at the option level; action validates that --url or --openapi is provided
    .option('--url <url>', 'Server URL (for streamable-http transport)')
    .option('--token <token>', 'Bearer token for upstream auth')
    .option('--header <kv...>', 'Custom headers (k=v format)', collect, [] as string[])
    .option('--no-auto-discover', 'Skip tool discovery on register')
    .option('--gateway <url>', 'Gateway URL')
    .option('--gateway-token <token>', 'Gateway admin token')
    .option('--openapi <urlOrPath>', 'OpenAPI 3.x spec URL or path')
    .option('--openapi-base-url <url>', 'Override OpenAPI servers[0].url')
    .option('--openapi-tags <tags>', 'Comma-separated tags filter')
    .option('--openapi-exclude <ops>', 'Comma-separated operationIds to exclude')
    .action(async (opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });

      if (opts.openapi) {
        const split = (s?: string) => s ? s.split(',').map((p: string) => p.trim()).filter(Boolean) : undefined;
        const transport: Record<string, unknown> = { type: 'openapi' };
        if (/^https?:\/\//.test(opts.openapi)) transport.specUrl = opts.openapi;
        else transport.specPath = opts.openapi;
        if (opts.openapiBaseUrl) transport.baseUrl = opts.openapiBaseUrl;
        const filter: Record<string, unknown> = {};
        const tags = split(opts.openapiTags);
        const exclude = split(opts.openapiExclude);
        if (tags) filter.tags = tags;
        if (exclude) filter.exclude = exclude;
        if (Object.keys(filter).length) transport.filter = filter;
        if (opts.token) transport.auth = { type: 'bearer', token: opts.token };
        try {
          await client.request('POST', '/api/servers', { name: opts.name, transport });
          ok(`Registered OpenAPI server '${opts.name}'`);
        } catch (e) {
          error(`Failed to register: ${(e as Error).message}`);
          exitWith(1);
        }
        return;
      }

      // streamable-http branch: --url is required when --openapi is not set
      if (!opts.url) {
        error('Either --url (streamable-http) or --openapi must be provided');
        exitWith(1);
      }

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
