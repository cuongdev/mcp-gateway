import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { substituteEnv } from '../../config/env-substitution.js';

/**
 * Read a JSON file from disk, apply ${VAR_NAME} env substitution to every string value,
 * and return the resulting object. Mirrors MCPJungle's `-c <file>` CLI flag semantics.
 */
export function loadConfigFile<T = unknown>(path: string): T {
  const abs = resolve(process.cwd(), path);
  let raw: string;
  try {
    raw = readFileSync(abs, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read config file ${abs}: ${(err as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in ${abs}: ${(err as Error).message}`);
  }
  return substituteEnv(parsed) as T;
}
