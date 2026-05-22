// Types for redaction engine (P7).
//
// Shared across:
//   - builtin-rules.ts  (raw rule definitions)
//   - engine.ts         (compiled rules + scan output)
//   - interceptors      (run scans into PipelineContext)
//   - findings.repo     (persistence — distinct row type)

export type RedactionMode = 'redact' | 'block' | 'warn';
export type RedactionScope = 'request' | 'response';

/** Raw (uncompiled) rule, either built-in or persisted in DB. */
export interface RawRule {
  id: string;
  name: string;
  kind: string;
  /** Source pattern string (will be compiled to a global RegExp). */
  pattern: string;
  mode: RedactionMode;
  replacement?: string;
  scopeRequest: boolean;
  scopeResponse: boolean;
  enabled?: boolean;
  /**
   * Optional post-filter — called on each candidate match string. Returning
   * false skips that match. Used for e.g. Luhn validation on credit cards.
   *
   * Note: only meaningful for built-in rules — DB-stored rules cannot carry
   * functions. Custom DB-defined rules may not set this.
   */
  postFilter?: (match: string) => boolean;
}

/** Rule after pattern compilation (RegExp). */
export interface CompiledRule {
  id: string;
  name: string;
  kind: string;
  pattern: RegExp;
  mode: RedactionMode;
  replacement: string;
  scopeRequest: boolean;
  scopeResponse: boolean;
  postFilter?: (match: string) => boolean;
}

/** A single rule's match summary for one scan call. */
export interface Finding {
  ruleId: string;
  ruleName: string;
  kind: string;
  mode: RedactionMode;
  count: number;
  /** Optional — caller may opt-in if needed; omitted by default to keep audit safe. */
  offsets?: Array<{ start: number; end: number }>;
}

/** Result of RedactionEngine.scan(). */
export interface ScanResult {
  value: unknown;
  findings: Finding[];
}

/** Thrown when any rule in 'block' mode matches. */
export class RedactionBlock extends Error {
  constructor(public readonly rule: CompiledRule, public readonly count: number) {
    super(`Redaction block by rule '${rule.name}'`);
    this.name = 'RedactionBlock';
  }
}
