import { describe, it, expect } from 'vitest';
import { RedactionEngine, compileRules } from '../../../src/redaction/engine.js';
import { BUILTIN_RULES } from '../../../src/redaction/builtin-rules.js';
import { RedactionBlock } from '../../../src/redaction/types.js';
import type { RawRule } from '../../../src/redaction/types.js';

const baseRule = (over: Partial<RawRule>): RawRule => ({
  id: 't', name: 'T', kind: 't.test',
  pattern: 'secret',
  mode: 'redact',
  scopeRequest: true,
  scopeResponse: true,
  ...over,
});

describe('RedactionEngine', () => {
  it('redacts matches in plain strings', () => {
    const rules = compileRules([baseRule({})]);
    const eng = new RedactionEngine(rules);
    const { value, findings } = eng.scan('a secret here', 'request');
    expect(String(value)).not.toContain('secret');
    expect(findings[0].count).toBe(1);
  });

  it('recurses into objects + arrays', () => {
    const rules = compileRules([baseRule({})]);
    const eng = new RedactionEngine(rules);
    const { value, findings } = eng.scan({
      a: 'has secret',
      nested: { b: ['x', 'two secret items secret here'] },
    }, 'request');
    const json = JSON.stringify(value);
    expect(json).not.toContain('secret');
    // Findings are emitted per scanned string. Two strings matched: 'has secret' (1) and 'two secret items secret here' (2).
    const total = findings.reduce((sum, f) => sum + f.count, 0);
    expect(total).toBe(3);
  });

  it('block mode throws RedactionBlock', () => {
    const rules = compileRules([baseRule({ mode: 'block' })]);
    const eng = new RedactionEngine(rules);
    expect(() => eng.scan({ a: 'has secret' }, 'request')).toThrow(RedactionBlock);
  });

  it('warn mode leaves value unchanged but records finding', () => {
    const rules = compileRules([baseRule({ mode: 'warn' })]);
    const eng = new RedactionEngine(rules);
    const { value, findings } = eng.scan('a secret pass', 'request');
    expect(value).toBe('a secret pass');
    expect(findings.length).toBe(1);
    expect(findings[0].mode).toBe('warn');
  });

  it('respects scopeRequest / scopeResponse flags', () => {
    const reqOnly = compileRules([baseRule({ id: 'r1', name: 'r1', scopeRequest: true, scopeResponse: false })]);
    const eng = new RedactionEngine(reqOnly);
    expect(eng.scan('secret', 'request').findings.length).toBe(1);
    expect(eng.scan('secret', 'response').findings.length).toBe(0);
  });

  it('skips strings >= 1 MB', () => {
    const rules = compileRules([baseRule({})]);
    const eng = new RedactionEngine(rules);
    const big = 'secret' + 'x'.repeat(1_000_000);
    const { findings } = eng.scan(big, 'request');
    expect(findings.length).toBe(0);
  });

  it('postFilter (Luhn) filters out invalid candidates', () => {
    const rules = compileRules([baseRule({
      id: 'cc', name: 'CC', kind: 'pii.credit_card',
      pattern: '\\b\\d{16}\\b',
      mode: 'redact',
      postFilter: (m) => m === '4242424242424242',
    })]);
    const eng = new RedactionEngine(rules);
    const { value, findings } = eng.scan('cards 4242424242424242 and 1234567890123456', 'request');
    expect(String(value)).not.toContain('4242424242424242');
    expect(String(value)).toContain('1234567890123456');
    expect(findings[0].count).toBe(1);
  });

  it('returns unchanged when no rules match', () => {
    const rules = compileRules([baseRule({})]);
    const eng = new RedactionEngine(rules);
    const input = { a: 1, b: 'hello' };
    const { value, findings } = eng.scan(input, 'request');
    expect(value).toEqual(input);
    expect(findings.length).toBe(0);
  });

  it('multiple rules — each gets its own finding entry', () => {
    const rules = compileRules([
      baseRule({ id: 'a', name: 'A', pattern: 'foo' }),
      baseRule({ id: 'b', name: 'B', pattern: 'bar' }),
    ]);
    const eng = new RedactionEngine(rules);
    const { findings } = eng.scan('foo and bar and foo', 'request');
    const map = new Map(findings.map((f) => [f.ruleId, f.count]));
    expect(map.get('a')).toBe(2);
    expect(map.get('b')).toBe(1);
  });

  it('built-in rules: perf bench — avg < 10 ms over 100 iterations on ~8 KB JSON', () => {
    const rules = compileRules(BUILTIN_RULES);
    const eng = new RedactionEngine(rules);
    // ~8 KB realistic JSON payload mostly safe text
    const payload = {
      messages: Array.from({ length: 30 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Step ${i}: please process this batch of data about quarterly reports and key business metrics across multiple regions. No secrets here.`,
      })),
      meta: { tenant: 'acme', userId: 'u_123', requestId: 'r_456' },
    };
    const sizeBytes = JSON.stringify(payload).length;
    expect(sizeBytes).toBeGreaterThan(2_000);

    const iters = 100;
    const start = performance.now();
    for (let i = 0; i < iters; i++) {
      eng.scan(payload, 'request');
    }
    const avgMs = (performance.now() - start) / iters;
    expect(avgMs).toBeLessThan(10);
  });

  it('engine ignores rules whose pattern fails safe-regex', () => {
    // Catastrophic backtracking pattern
    const rules = compileRules([baseRule({ id: 'x', pattern: '(a+)+b' })]);
    // The unsafe pattern should have been dropped at compile time.
    expect(rules.length).toBe(0);
  });
});
