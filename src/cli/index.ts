import { Command } from 'commander';
import { registerMigrateCommands } from './commands/migrate.js';
import { registerInitServerCommand } from './commands/init-server.js';
import { registerSeedCommand } from './commands/seed.js';

async function main() {
  const program = new Command();
  program
    .name('mcp-gateway')
    .description('MCP Gateway management CLI')
    .version('0.2.0');

  registerMigrateCommands(program);
  registerInitServerCommand(program);
  registerSeedCommand(program);

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\x1b[31m✗\x1b[0m ${msg}`);
  process.exit(1);
});
