import type { Command } from 'commander';
import { GatewayClient } from '../shared/client.js';
import { ok, error, box, exitWith } from '../shared/output.js';
import { formatOutput } from '../shared/table.js';

export function registerTokenCommand(program: Command): void {
  const tok = program.command('token').description('Personal Access Token management (for users)');

  tok.command('list')
    .description('List your active tokens')
    .option('--gateway <url>', 'Gateway URL')
    .option('--gateway-token <token>', 'Your access token')
    .option('--output <fmt>', 'json | table', 'table')
    .action(async (opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      const r = await client.request<{ tokens: Array<Record<string, unknown>> }>('GET', '/api/users/me/tokens');
      console.log(formatOutput(r.tokens, opts.output));
    });

  tok.command('create')
    .description('Create a new PAT')
    .requiredOption('--name <name>', 'Token label')
    .option('--expires-in-days <n>', 'Expiry in days', parseInt)
    .option('--gateway <url>', 'Gateway URL')
    .option('--gateway-token <token>', 'Your existing access token')
    .action(async (opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      try {
        const r = await client.request<{ token: string; tokenId: string }>('POST', '/api/users/me/tokens', {
          name: opts.name,
          expiresInDays: opts.expiresInDays,
        });
        box('NEW TOKEN — save it', [r.token, '', `Token ID: ${r.tokenId}`]);
      } catch (e) {
        error((e as Error).message);
        exitWith(1);
      }
    });

  tok.command('revoke')
    .description('Revoke a PAT by token id')
    .argument('<tokenId>')
    .option('--gateway <url>', 'Gateway URL')
    .option('--gateway-token <token>', 'Your access token')
    .action(async (tokenId: string, opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      try {
        await client.request('DELETE', `/api/users/me/tokens/${encodeURIComponent(tokenId)}`);
        ok(`Revoked token ${tokenId}`);
      } catch (e) {
        error((e as Error).message);
        exitWith(1);
      }
    });
}
