import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createStorage } from '../../src/storage/index.js';

const ROOT = process.cwd();
const CONFIG_PATH = join(ROOT, 'tests/fixtures/seeds/sample.config.json');
const POLICY_PATH = join(ROOT, 'tests/fixtures/seeds/sample.policy.csv');

function runCli(args: string[], dbPath: string) {
  return spawnSync('npx', ['tsx', join(ROOT, 'src/cli/index.ts'), ...args],
    { env: { ...process.env, MCP_DB_PATH: dbPath }, encoding: 'utf8' });
}

describe('migrate seed', () => {
  it('imports servers, groups, and policies from files into empty DB', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-seed-'));
    const dbPath = join(dir, 'test.sqlite');
    try {
      const r = runCli(
        ['migrate', 'seed', '--from', CONFIG_PATH, '--policy', POLICY_PATH],
        dbPath,
      );
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/seeded 2 server/i);
      expect(r.stdout).toMatch(/seeded 1 group/i);
      expect(r.stdout).toMatch(/seeded 4 polic/i);

      const s = await createStorage({ driver: 'sqlite', path: dbPath });
      expect((await s.servers.list()).map((x) => x.name).sort()).toEqual(['db', 'fs']);
      expect((await s.groups.list())[0].name).toBe('data-analyst');
      expect((await s.policies.list()).length).toBe(4);
      await s.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses on non-empty DB without --force', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-seed-'));
    const dbPath = join(dir, 'test.sqlite');
    try {
      let r = runCli(['migrate', 'seed', '--from', CONFIG_PATH], dbPath);
      expect(r.status).toBe(0);
      r = runCli(['migrate', 'seed', '--from', CONFIG_PATH], dbPath);
      expect(r.status).not.toBe(0);
      expect(r.stderr + r.stdout).toMatch(/already seeded|--force/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--force overrides non-empty DB', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-seed-'));
    const dbPath = join(dir, 'test.sqlite');
    try {
      runCli(['migrate', 'seed', '--from', CONFIG_PATH], dbPath);
      const r = runCli(['migrate', 'seed', '--from', CONFIG_PATH, '--force'], dbPath);
      expect(r.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
