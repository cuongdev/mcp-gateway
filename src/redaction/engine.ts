// Redaction Engine (P7 §6.2).
//
// Walks a JSON-like value recursively, scans string leaves against each
// compiled rule, and emits a redacted copy + findings array.
//
// Modes:
//   redact - replace matches with `replacement` text
//   block  - throw RedactionBlock at first matching rule
//   warn   - record finding only, pass through unchanged
//
// Guards:
//   - Strings >= 1 MB are skipped (cost guard from spec)
//   - postFilter (e.g. Luhn) may reject candidate matches
//   - Per-rule regex execution wrapped in try/catch — never throws to caller
//
// Performance target (spec §6.2): scan 8 KB JSON with all rules < 5 ms p99.

import type { CompiledRule, Finding, RawRule, RedactionScope, ScanResult } from './types.js';
import { RedactionBlock } from './types.js';
import { isSafeRegex } from './safe-regex-validator.js';
import { logger } from '../utils/logger.js';

const MAX_STRING_LEN = 1_000_000; // 1 MB
const log = logger.child({ component: 'redaction-engine' });

/**
 * Compile a raw rule into an engine-ready rule. Returns null and logs a
 * warning if the pattern fails safe-regex inspection (potential ReDoS).
 */
export function compileRule(raw: RawRule): CompiledRule | null {
  if (!isSafeRegex(raw.pattern)) {
    log.warn({ ruleId: raw.id, ruleName: raw.name }, 'Rule pattern failed safe-regex check; skipping');
    return null;
  }
  let re: RegExp;
  try {
    re = new RegExp(raw.pattern, 'g');
  } catch (err) {
    log.warn({ ruleId: raw.id, err: (err as Error).message }, 'Rule pattern failed to compile; skipping');
    return null;
  }
  return {
    id: raw.id,
    name: raw.name,
    kind: raw.kind,
    pattern: re,
    mode: raw.mode,
    replacement: raw.replacement ?? `[REDACTED:${raw.kind}]`,
    scopeRequest: raw.scopeRequest,
    scopeResponse: raw.scopeResponse,
    postFilter: raw.postFilter,
  };
}

/** Compile many; drops any that fail safe-regex or RegExp compile. */
export function compileRules(rules: ReadonlyArray<RawRule>): CompiledRule[] {
  const out: CompiledRule[] = [];
  for (const r of rules) {
    if (r.enabled === false) continue;
    const c = compileRule(r);
    if (c) out.push(c);
  }
  return out;
}

export class RedactionEngine {
  constructor(private readonly rules: ReadonlyArray<CompiledRule>) {}

  /**
   * Scan a value (typically `params.arguments` or a tool-call result).
   * Returns a redacted copy of `value` plus a per-rule findings array.
   * Throws `RedactionBlock` if any `block`-mode rule matched.
   */
  scan(value: unknown, scope: RedactionScope): ScanResult {
    const findings: Finding[] = [];
    const out = this.walk(value, scope, findings);
    return { value: out, findings };
  }

  private walk(node: unknown, scope: RedactionScope, findings: Finding[]): unknown {
    if (node == null) return node;
    if (typeof node === 'string') {
      return this.scanString(node, scope, findings);
    }
    if (Array.isArray(node)) {
      return node.map((item) => this.walk(item, scope, findings));
    }
    if (typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(obj)) {
        out[key] = this.walk(obj[key], scope, findings);
      }
      return out;
    }
    return node;
  }

  private scanString(input: string, scope: RedactionScope, findings: Finding[]): string {
    if (input.length === 0) return input;
    if (input.length >= MAX_STRING_LEN) return input;

    let current = input;
    for (const rule of this.rules) {
      if (scope === 'request' && !rule.scopeRequest) continue;
      if (scope === 'response' && !rule.scopeResponse) continue;

      let matches: RegExpMatchArray[];
      try {
        // Reset lastIndex defensively since we use the global flag.
        rule.pattern.lastIndex = 0;
        matches = Array.from(current.matchAll(rule.pattern));
      } catch (err) {
        log.warn({ ruleId: rule.id, err: (err as Error).message }, 'Regex execution failed');
        continue;
      }
      if (matches.length === 0) continue;

      // Apply postFilter (e.g. Luhn).
      const valid = rule.postFilter
        ? matches.filter((m) => rule.postFilter!(m[0]))
        : matches;
      if (valid.length === 0) continue;

      if (rule.mode === 'block') {
        throw new RedactionBlock(rule, valid.length);
      }

      findings.push({
        ruleId: rule.id,
        ruleName: rule.name,
        kind: rule.kind,
        mode: rule.mode,
        count: valid.length,
      });

      if (rule.mode === 'redact') {
        // Replace each valid match in-place. We need to rebuild because
        // postFilter may have dropped some matches.
        if (rule.postFilter) {
          let rebuilt = '';
          let cursor = 0;
          for (const m of matches) {
            const idx = m.index ?? -1;
            if (idx < 0) continue;
            if (!rule.postFilter(m[0])) continue;
            rebuilt += current.slice(cursor, idx) + rule.replacement;
            cursor = idx + m[0].length;
          }
          rebuilt += current.slice(cursor);
          current = rebuilt;
        } else {
          rule.pattern.lastIndex = 0;
          current = current.replace(rule.pattern, rule.replacement);
        }
      }
      // warn-mode: leave string unchanged.
    }
    return current;
  }
}
