import { describe, it, expect } from 'vitest';
import { substituteEnv } from '../../../src/config/env-substitution.js';

describe('substituteEnv', () => {
  it('replaces ${VAR} in string values', () => {
    const env = { HOST: 'db.internal', PORT: '5432' };
    expect(substituteEnv('http://${HOST}:${PORT}/mcp', env))
      .toBe('http://db.internal:5432/mcp');
  });

  it('recurses into objects and arrays', () => {
    const env = { TOKEN: 'sekret' };
    const input = {
      transport: { url: 'x', bearerToken: '${TOKEN}', headers: { 'X-Auth': '${TOKEN}' } },
      tags: ['a', '${TOKEN}'],
    };
    const out = substituteEnv(input, env) as typeof input;
    expect(out.transport.bearerToken).toBe('sekret');
    expect(out.transport.headers['X-Auth']).toBe('sekret');
    expect(out.tags[1]).toBe('sekret');
  });

  it('throws on missing env var', () => {
    expect(() => substituteEnv('http://${MISSING}', {})).toThrow(/Missing env var MISSING/);
  });

  it('does not substitute non-string values', () => {
    expect(substituteEnv(42, {})).toBe(42);
    expect(substituteEnv(null, {})).toBe(null);
    expect(substituteEnv(true, {})).toBe(true);
  });

  it('handles strings without placeholders', () => {
    expect(substituteEnv('plain string', {})).toBe('plain string');
  });
});
