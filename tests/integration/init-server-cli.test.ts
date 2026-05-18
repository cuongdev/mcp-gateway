import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createStorage } from '../../src/storage/index.js';

const ROOT = process.cwd();

function runCli(args: string[], dbPath: string) {
  return spawnSync('npx', ['tsx', join(ROOT, 'src/cli/index.ts'), ...args],
    { env: { ...process.env, MCP_DB_PATH: dbPath }, encoding: 'utf8' });
}

describe('init-server CLI', () => {
  it('bootstraps admin and prints a single token', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-init-'));
    const dbPath = join(dir, 'test.sqlite');
    try {
      const r = runCli(['init-server'], dbPath);
      expect(r.status).toBe(0);
      const m = /mcp_sat_live_[A-Z2-7]{32}/.exec(r.stdout);
      expect(m).not.toBeNull();

      // Verify DB state
      const s = await createStorage({ driver: 'sqlite', path: dbPath });
      const admin = await s.principals.findBootstrapAdmin();
      expect(admin).not.toBeNull();
      expect(admin?.isBootstrap).toBe(true);
      const policies = await s.policies.list();
      expect(policies.some((p) => p.ptype === 'p' && p.values[0] === 'role:admin')).toBe(true);
      expect(policies.some((p) => p.ptype === 'g' && p.values[0] === admin!.id && p.values[1] === 'role:admin')).toBe(true);
      await s.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses second invocation', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-init-'));
    const dbPath = join(dir, 'test.sqlite');
    try {
      let r = runCli(['init-server'], dbPath);
      expect(r.status).toBe(0);
      r = runCli(['init-server'], dbPath);
      expect(r.status).not.toBe(0);
      expect(r.stderr + r.stdout).toMatch(/already initialized|bootstrap.*exists/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
