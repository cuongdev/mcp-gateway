import { describe, it, expect } from 'vitest';
import {
  generateToken, parseToken, computePrefix,
  TOKEN_HEADER_LEN, TOKEN_PREFIX_LEN, TOKEN_SECRET_LEN,
} from '../../../src/identity/token.js';

describe('token', () => {
  it('generates a well-formed token', () => {
    const raw = generateToken('sat', 'live');
    expect(raw.startsWith('mcp_sat_live_')).toBe(true);
    expect(raw.length).toBe(TOKEN_HEADER_LEN + TOKEN_SECRET_LEN);
  });

  it('parseToken returns components', () => {
    const raw = generateToken('pat', 'live');
    const parsed = parseToken(raw);
    expect(parsed?.type).toBe('pat');
    expect(parsed?.env).toBe('live');
    expect(parsed?.prefix.length).toBe(TOKEN_PREFIX_LEN);
    expect(parsed?.secret.length).toBe(TOKEN_SECRET_LEN);
  });

  it('parseToken returns null for malformed input', () => {
    expect(parseToken('garbage')).toBeNull();
    expect(parseToken('mcp_xxx_live_AAAA')).toBeNull();           // bad type
    expect(parseToken('mcp_pat_xxxx_AAAA')).toBeNull();           // bad env
    expect(parseToken('mcp_pat_live_too-short')).toBeNull();      // short secret
  });

  it('computePrefix is deterministic', () => {
    const raw = 'mcp_sat_live_ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    expect(computePrefix(raw)).toBe('mcp_sat_live_ABCDEFGH');
  });

  it('generated tokens have unique secrets', () => {
    const a = generateToken('pat', 'live');
    const b = generateToken('pat', 'live');
    expect(a).not.toBe(b);
  });

  it('all three types and envs round-trip', () => {
    for (const type of ['pat', 'sat', 'mct'] as const) {
      for (const env of ['live', 'test', 'dev'] as const) {
        const raw = generateToken(type, env);
        const parsed = parseToken(raw);
        expect(parsed?.type).toBe(type);
        expect(parsed?.env).toBe(env);
      }
    }
  });
});
