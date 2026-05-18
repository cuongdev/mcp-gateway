import type { Command } from 'commander';
import { createStorage } from '../../storage/index.js';
import { newId } from '../../utils/uuid.js';
import { hashSecret } from '../../utils/crypto.js';
import { generateToken, computePrefix } from '../../identity/token.js';
import { ok, info, error, box, exitWith } from '../shared/output.js';

function resolveDbPath(opt?: string): string {
  return opt ?? process.env.MCP_DB_PATH ?? './data/mcp.sqlite';
}

export function registerInitServerCommand(program: Command): void {
  program
    .command('init-server')
    .description('Bootstrap admin ServiceAccount and print its access token (once)')
    .option('--db <path>', 'SQLite database path')
    .option('--env <env>', 'Token environment (live|test|dev)', 'live')
    .action(async (opts) => {
      const path = resolveDbPath(opts.db);
      const env = opts.env as 'live' | 'test' | 'dev';
      const storage = await createStorage({ driver: 'sqlite', path });

      const existing = await storage.principals.findBootstrapAdmin();
      if (existing) {
        error('Gateway already initialized — bootstrap admin exists.');
        info('To rotate the admin token, use `mcp-gateway token rotate <token-id>` (available in P1).');
        await storage.close();
        exitWith(2);
      }

      const principalId = newId();
      await storage.principals.createServiceAccount({
        id: principalId, displayName: 'admin', description: 'bootstrap admin', isBootstrap: true,
      });

      const raw = generateToken('sat', env);
      const tokenId = newId();
      await storage.tokens.create({
        id: tokenId, principalId, prefix: computePrefix(raw),
        hash: await hashSecret(raw), name: 'bootstrap',
      });

      // Insert default policy: g <principalId> role:admin; p role:admin * *
      await storage.policies.replaceAll([
        { ptype: 'p', values: ['role:admin', '*', '*'] },
        { ptype: 'g', values: [principalId, 'role:admin'] },
      ]);

      ok('Gateway initialized successfully.');
      box('ADMIN TOKEN — save this; will not be shown again', [
        raw,
        '',
        `Principal ID: ${principalId}`,
        `Token ID:     ${tokenId}`,
      ]);

      await storage.close();
    });
}
