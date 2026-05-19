import type { Command } from 'commander';
import { GatewayClient } from '../shared/client.js';
import { ok, error, exitWith } from '../shared/output.js';
import { loadConfigFile } from '../shared/load-config.js';

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
    .option('-c, --config <path>', 'JSON config file with full server registration body')
    .action(async (opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });

      if (opts.config) {
        const body = loadConfigFile<Record<string, unknown>>(opts.config);
        // MCPJungle uses {transport: "streamable_http", url: "..."} flat form;
        // we accept BOTH that flat form AND our nested {name, transport: {type, url, ...}} form.
        let postBody: Record<string, unknown>;
        if (typeof body.transport === 'string') {
          // Flat MCPJungle-style → translate to nested
          const { name, transport, description, url, command, args, env, bearer_token, bearerToken, headers, session_mode, sessionMode, ...rest } = body as Record<string, unknown>;
          const transportObj: Record<string, unknown> = { type: transport === 'streamable_http' ? 'streamable-http' : transport };
          if (url !== undefined) transportObj.url = url;
          if (command !== undefined) transportObj.command = command;
          if (args !== undefined) transportObj.args = args;
          if (env !== undefined) transportObj.env = env;
          const tok = bearer_token ?? bearerToken;
          if (tok !== undefined) transportObj.bearerToken = tok;
          if (headers !== undefined) transportObj.headers = headers;
          const sm = session_mode ?? sessionMode;
          if (sm !== undefined) transportObj.session_mode = sm;
          postBody = { name, transport: transportObj, description, ...rest };
        } else {
          postBody = body;
        }
        try {
          await client.request('POST', '/api/servers', postBody);
          ok(`Registered server '${(postBody.name as string) ?? '<unnamed>'}'`);
          return;
        } catch (e) {
          error(`Failed to register: ${(e as Error).message}`);
          exitWith(1);
        }
        return;
      }

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
