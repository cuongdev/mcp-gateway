// Seed built-in redaction rules into a tenant on first boot.
// Idempotent: skips if any built-in rule already exists for that tenant.

import type { StorageAdapter } from '../storage/adapter.js';
import { BUILTIN_RULES } from './builtin-rules.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ component: 'redaction-seed' });

/**
 * Seed all built-in rules into the redaction_rules table for `tenantId`.
 * No-ops if any row already exists with built_in=1 for that tenant.
 *
 * Returns the number of rows actually inserted (0 if already seeded).
 */
export async function seedBuiltinRedactionRules(
  storage: StorageAdapter,
  tenantId: string = 'tnt_default',
): Promise<number> {
  const existing = await storage.redactionRules.list({ tenantId, builtIn: true });
  if (existing.length > 0) return 0;

  let inserted = 0;
  for (const raw of BUILTIN_RULES) {
    try {
      await storage.redactionRules.create({
        id: raw.id,
        name: raw.name,
        kind: raw.kind,
        pattern: raw.pattern,
        mode: raw.mode,
        replacement: raw.replacement ?? null,
        builtIn: true,
        scopeRequest: raw.scopeRequest,
        scopeResponse: raw.scopeResponse,
        enabled: raw.enabled !== false,
        tenantId,
      });
      inserted++;
    } catch (err) {
      // Conflict — another concurrent seed may have raced. Skip.
      log.warn({ ruleId: raw.id, err: (err as Error).message, tenantId }, 'Skipped built-in rule (already exists)');
    }
  }
  log.info({ tenantId, inserted }, 'Seeded built-in redaction rules');
  return inserted;
}

/**
 * Seed for every tenant present in storage. Called at gateway start().
 */
export async function seedAllTenants(storage: StorageAdapter): Promise<void> {
  // Always seed the default tenant — listed or not.
  await seedBuiltinRedactionRules(storage, 'tnt_default');
  try {
    const tenants = await storage.tenants.list();
    for (const t of tenants) {
      if (t.id === 'tnt_default') continue;
      await seedBuiltinRedactionRules(storage, t.id);
    }
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'tenants.list failed during seed; default tenant seeded only');
  }
}
