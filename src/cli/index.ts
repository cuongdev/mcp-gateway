import { Command } from 'commander';
import { registerMigrateCommands } from './commands/migrate.js';
import { registerInitServerCommand } from './commands/init-server.js';
import { registerSeedCommand } from './commands/seed.js';
import { registerRegisterCommand } from './commands/register.js';
import { registerDeregisterCommand } from './commands/deregister.js';
import { registerListCommand } from './commands/list.js';
import { registerEnableDisableCommands } from './commands/enable.js';
import { registerInvokeCommand } from './commands/invoke.js';
import { registerCreateMcpClientCommand } from './commands/create-mcp-client.js';
import { registerCreateUserCommand } from './commands/create-user.js';
import { registerCreateGroupCommand } from './commands/create-group.js';
import { registerRoleCommand } from './commands/role.js';
import { registerTokenCommand } from './commands/token.js';
import { registerConfigCommand } from './commands/config.js';
import { registerPolicyCommand } from './commands/policy.js';
import { registerUsageCommand } from './commands/usage.js';
import { registerToolFlagCommand } from './commands/tool-flag.js';
import { registerCacheCommand } from './commands/cache.js';
import { registerQuotaCommand } from './commands/quota.js';
import { registerRateLimitCommand } from './commands/rate-limit.js';
import { registerApprovalCommand } from './commands/approval.js';
import { registerWebhookCommand } from './commands/webhook.js';
import { registerTenantCommand } from './commands/tenant.js';
import { registerProxyCommand } from './commands/proxy.js';
import { registerCircuitCommand } from './commands/circuit.js';
import { registerRedactionCommand } from './commands/redaction.js';
import { registerCatalogCommand } from './commands/catalog.js';
import { registerVirtualToolCommand } from './commands/virtual-tool.js';

async function main() {
  const program = new Command();
  program
    .name('mcp-gateway')
    .description('MCP Gateway management CLI')
    .version('0.8.0');

  registerMigrateCommands(program);
  registerInitServerCommand(program);
  registerSeedCommand(program);
  registerRegisterCommand(program);
  registerDeregisterCommand(program);
  registerListCommand(program);
  registerEnableDisableCommands(program);
  registerInvokeCommand(program);
  registerCreateMcpClientCommand(program);
  registerCreateUserCommand(program);
  registerCreateGroupCommand(program);
  registerRoleCommand(program);
  registerTokenCommand(program);
  registerConfigCommand(program);
  registerPolicyCommand(program);
  registerUsageCommand(program);
  registerToolFlagCommand(program);
  registerCacheCommand(program);
  registerQuotaCommand(program);
  registerRateLimitCommand(program);
  registerApprovalCommand(program);
  registerWebhookCommand(program);
  registerTenantCommand(program);
  registerProxyCommand(program);
  registerCircuitCommand(program);
  registerRedactionCommand(program);
  registerCatalogCommand(program);
  registerVirtualToolCommand(program);

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\x1b[31m✗\x1b[0m ${msg}`);
  process.exit(1);
});
