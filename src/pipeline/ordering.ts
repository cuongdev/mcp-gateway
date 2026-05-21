// ============================================================
// Pipeline — Canonical interceptor ordering (spec §4.2)
// ============================================================

/**
 * Canonical priorities for built-in interceptors. Lower priority runs first
 * in the `before` phase and last in the `after` phase. Custom interceptors
 * may use values outside this set, but should respect the conventional
 * buckets (10-29 auth/authz, 30-89 pre-call, 90-129 post-call).
 */
export const PIPELINE_PRIORITY = {
  AUTH: 10,
  RBAC: 20,
  CIRCUIT_BREAKER: 30,
  REDACT_REQUEST: 40,
  APPROVAL_GATE: 50,
  RATE_LIMIT: 60,
  QUOTA: 70,
  CACHE_LOOKUP: 80,
  CACHE_STORE: 90,
  REDACT_RESPONSE: 100,
  USAGE_COUNTER: 110,
  AUDIT: 120,
} as const;

export type PipelinePriority =
  (typeof PIPELINE_PRIORITY)[keyof typeof PIPELINE_PRIORITY];
