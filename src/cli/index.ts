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

async function main() {
  const program = new Command();
  program
    .name('mcp-gateway')
    .description('MCP Gateway management CLI')
    .version('0.2.0');

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

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\x1b[31m✗\x1b[0m ${msg}`);
  process.exit(1);
});
