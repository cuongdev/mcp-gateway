import type { Command } from 'commander';
import { GatewayClient } from '../shared/client.js';
import { ok, error, exitWith } from '../shared/output.js';

export function registerRoleCommand(program: Command): void {
  const role = program.command('role').description('Manage Casbin role assignments');

  role.command('assign')
    .description('Assign a role to a user (by email or principal id)')
    .argument('<userOrId>', 'Email or principal ID')
    .argument('<role>', 'Role name (e.g. admin, analyst)')
    .option('--gateway <url>', 'Gateway URL')
    .option('--gateway-token <token>', 'Admin token')
    .action(async (userOrId: string, roleName: string, opts) => {
      const client = new GatewayClient({ url: opts.gateway, token: opts.gatewayToken });
      try {
        let subject = userOrId;
        if (userOrId.includes('@')) {
          const r = await client.request<{ users: Array<{ email: string; principalId: string }> }>('GET', '/api/users');
          const u = r.users.find((x) => x.email === userOrId);
          if (!u) throw new Error(`User with email '${userOrId}' not found`);
          subject = u.principalId;
        }
        await client.request('POST', '/api/policies', {
          ptype: 'g',
          values: [subject, `role:${roleName}`],
        });
        ok(`Assigned role '${roleName}' to ${userOrId}`);
      } catch (e) {
        error((e as Error).message);
        exitWith(1);
      }
    });
}
