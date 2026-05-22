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
  { version: 3, name: 'p2_usage_cache', file: '0003_p2_usage_cache.sqlite.sql', dialect: 'sqlite' },
  { version: 3, name: 'p2_usage_cache', file: '0003_p2_usage_cache.postgres.sql', dialect: 'postgres' },
  { version: 4, name: 'p3_approvals_webhooks', file: '0004_p3_approvals_webhooks.sqlite.sql', dialect: 'sqlite' },
  { version: 4, name: 'p3_approvals_webhooks', file: '0004_p3_approvals_webhooks.postgres.sql', dialect: 'postgres' },
  { version: 5, name: 'p3_openapi_transport', file: '0005_p3_openapi_transport.sqlite.sql', dialect: 'sqlite' },
  { version: 5, name: 'p3_openapi_transport', file: '0005_p3_openapi_transport.postgres.sql', dialect: 'postgres' },
  { version: 6, name: 'p4_tenants', file: '0006_p4_tenants.sqlite.sql', dialect: 'sqlite' },
  { version: 6, name: 'p4_tenants', file: '0006_p4_tenants.postgres.sql', dialect: 'postgres' },
  { version: 7, name: 'p5_proxies', file: '0007_p5_proxies.sqlite.sql', dialect: 'sqlite' },
  { version: 7, name: 'p5_proxies', file: '0007_p5_proxies.postgres.sql', dialect: 'postgres' },
  { version: 8, name: 'p6_foundation', file: '0008_p6_foundation.sqlite.sql', dialect: 'sqlite' },
  { version: 8, name: 'p6_foundation', file: '0008_p6_foundation.postgres.sql', dialect: 'postgres' },
  { version: 9, name: 'p6_features', file: '0009_p6_features.sqlite.sql', dialect: 'sqlite' },
  { version: 9, name: 'p6_features', file: '0009_p6_features.postgres.sql', dialect: 'postgres' },
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
