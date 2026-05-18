import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface MigrationFile {
  version: number;
  name: string;
  dialect: 'sqlite' | 'postgres';
  sql: string;
}

// Static list — keep in lockstep with files in this directory.
const MIGRATIONS: Array<{ version: number; name: string; file: string; dialect: 'sqlite' | 'postgres' }> = [
  { version: 1, name: 'initial', file: '0001_initial.sqlite.sql', dialect: 'sqlite' },
  { version: 1, name: 'initial', file: '0001_initial.postgres.sql', dialect: 'postgres' },
  { version: 2, name: 'p1_prompts_groups', file: '0002_p1_prompts_groups.sqlite.sql', dialect: 'sqlite' },
  { version: 2, name: 'p1_prompts_groups', file: '0002_p1_prompts_groups.postgres.sql', dialect: 'postgres' },
];

export function listMigrations(dialect: 'sqlite' | 'postgres' = 'sqlite'): MigrationFile[] {
  return MIGRATIONS
    .filter((m) => m.dialect === dialect)
    .map((m) => ({
      version: m.version,
      name: m.name,
      dialect: m.dialect,
      sql: readFileSync(join(__dirname, m.file), 'utf-8'),
    }))
    .sort((a, b) => a.version - b.version);
}
