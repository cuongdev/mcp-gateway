import type { Command } from 'commander';
import { GatewayClient } from '../shared/client.js';
import { ok, error, exitWith } from '../shared/output.js';

const KIND_TO_PATH: Record<string, (name: string) => string> = {
  tool: (n) => `/api/tools/${encodeURIComponent(n)}`,
  prompt: (n) => `/api/prompts/${encodeURIComponent(n)}`,
  server: (n) => `/api/servers/${encodeURIComponent(n)}`,
};

function registerToggle(program: Command, action: 'enable' | 'disable'): void {
  program.command(action)
    .description(`${action[0].toUpperCase() + action.slice(1)} a tool, prompt, or server`)
    .argument('<kind>', 'tool | prompt | server')
    .argument('<name>', 'canonical name')
    .option('--gateway <url>', 'Gateway URL')
    .option('--gateway-token <token>', 'Gateway admin token')
    .action(async (kind: string, name: string, opts) => {
      if (!KIND_TO_PATH[kind]) {
        error(`Unknown kind '${kind}'. Use: tool, prompt, server`);
        exitWith(2);
      }
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      try {
        if (kind === 'tool' || kind === 'prompt') {
          await client.request('PUT', `${KIND_TO_PATH[kind](name)}/${action}`);
        } else {
          await client.request('PATCH', KIND_TO_PATH[kind](name), { enabled: action === 'enable' });
        }
        ok(`${action[0].toUpperCase() + action.slice(1)}d ${kind} '${name}'`);
      } catch (e) {
        error((e as Error).message);
        exitWith(1);
      }
    });
}

export function registerEnableDisableCommands(program: Command): void {
  registerToggle(program, 'enable');
  registerToggle(program, 'disable');
}
