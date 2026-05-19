import type { Command } from 'commander';
import { GatewayClient } from '../shared/client.js';
import { ok, error, exitWith } from '../shared/output.js';
import { loadConfigFile } from '../shared/load-config.js';

export function registerCreateUserCommand(program: Command): void {
  program.command('create-user')
    .description('Admin: create a user account')
    .option('--email <email>', 'Email address')
    .option('--name <displayName>', 'Display name')
    .option('-c, --config <path>', 'JSON config file')
    .option('--gateway <url>', 'Gateway URL')
    .option('--gateway-token <token>', 'Admin token')
    .action(async (opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      let postBody: Record<string, unknown>;
      if (opts.config) {
        postBody = loadConfigFile<Record<string, unknown>>(opts.config);
      } else {
        if (!opts.email) {
          error('Either --email <email> or -c <config-file> is required');
          exitWith(1);
          return;
        }
        postBody = { email: opts.email, displayName: opts.name ?? opts.email };
      }
      const email = (postBody.email as string | undefined) ?? opts.email ?? '<unknown>';
      try {
        const r = await client.request<{ principalId: string }>('POST', '/api/users', postBody);
        ok(`Created user '${email}' (principal ${r.principalId})`);
      } catch (e) {
        error((e as Error).message);
        exitWith(1);
      }
    });
}
