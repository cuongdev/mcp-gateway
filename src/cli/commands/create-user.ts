import type { Command } from 'commander';
import { GatewayClient } from '../shared/client.js';
import { ok, error, exitWith } from '../shared/output.js';

export function registerCreateUserCommand(program: Command): void {
  program.command('create-user')
    .description('Admin: create a user account')
    .requiredOption('--email <email>', 'Email address')
    .option('--name <displayName>', 'Display name')
    .option('--gateway <url>', 'Gateway URL')
    .option('--gateway-token <token>', 'Admin token')
    .action(async (opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      try {
        const r = await client.request<{ principalId: string }>('POST', '/api/users', {
          email: opts.email,
          displayName: opts.name ?? opts.email,
        });
        ok(`Created user '${opts.email}' (principal ${r.principalId})`);
      } catch (e) {
        error((e as Error).message);
        exitWith(1);
      }
    });
}
