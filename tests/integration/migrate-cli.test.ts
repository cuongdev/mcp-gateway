import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();

function runCli(args: string[], dbPath: string): { stdout: string; stderr: string; status: number } {
  const r = spawnSync('npx', ['tsx', join(ROOT, 'src/cli/index.ts'), ...args],
    { env: { ...process.env, MCP_DB_PATH: dbPath }, encoding: 'utf8' });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status ?? 1 };
}

describe('migrate CLI', () => {
  it('migrate up applies migrations; status shows applied', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-cli-'));
    const dbPath = join(dir, 'test.sqlite');
    try {
      let r = runCli(['migrate', 'up'], dbPath);
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/Applied 2 migration/);

      r = runCli(['migrate', 'status'], dbPath);
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/applied:\s*2/);
      expect(r.stdout).toMatch(/pending:\s*0/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('migrate up is idempotent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-cli-'));
    const dbPath = join(dir, 'test.sqlite');
    try {
      runCli(['migrate', 'up'], dbPath);
      const r = runCli(['migrate', 'up'], dbPath);
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/Applied 0 migration/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
