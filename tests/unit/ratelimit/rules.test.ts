import { describe, it, expect } from 'vitest';
import { parseLimit, matchRule, type Rule } from '../../../src/ratelimit/rules.js';

describe('parseLimit', () => {
  it('parses "1000/min"', () => {
    expect(parseLimit('1000/min')).toEqual({ count: 1000, windowSec: 60 });
  });
  it('parses "10/sec"', () => {
    expect(parseLimit('10/sec')).toEqual({ count: 10, windowSec: 1 });
  });
  it('parses "100/hour"', () => {
    expect(parseLimit('100/hour')).toEqual({ count: 100, windowSec: 3600 });
  });
  it('parses "5000/day"', () => {
    expect(parseLimit('5000/day')).toEqual({ count: 5000, windowSec: 86400 });
  });
  it('throws on invalid format', () => {
    expect(() => parseLimit('weekly')).toThrow();
    expect(() => parseLimit('1000/century')).toThrow();
  });
});

describe('matchRule', () => {
  const rules: Rule[] = [
    { principalType: 'mcp_client', limit: '200/min' },
    { tool: '*__delete*', limit: '10/min' },
    { principalType: 'user', tool: '*', limit: '5000/min' },
  ];

  it('returns most-specific match (principalType + tool both set wins)', () => {
    const m = matchRule(rules, { principalType: 'user', principalId: 'prn_u', tool: 'db__query' });
    expect(m?.limit).toBe('5000/min');
  });

  it('matches tool wildcard `*__delete*`', () => {
    const m = matchRule(rules, { principalType: 'mcp_client', principalId: 'prn_c', tool: 'db__delete' });
    // tie: principalType-only "mcp_client → 200/min" (specificity 1) vs tool-only "*__delete* → 10/min" (specificity 1)
    // tie broken by first occurrence; mcp_client rule wins.
    expect(m?.limit).toBe('200/min');
  });

  it('returns null when no rule matches', () => {
    const m = matchRule(rules, { principalType: 'service_account', principalId: 'prn_s', tool: 'db__q' });
    expect(m).toBeNull();
  });

  it('principalId override beats type-only', () => {
    const rs: Rule[] = [
      { principalType: 'user', limit: '100/min' },
      { principalId: 'prn_special', limit: '99999/min' },
    ];
    const m = matchRule(rs, { principalType: 'user', principalId: 'prn_special', tool: 'x__y' });
    expect(m?.limit).toBe('99999/min');
  });
});
