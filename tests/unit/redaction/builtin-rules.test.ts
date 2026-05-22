import { describe, it, expect } from 'vitest';
import { BUILTIN_RULES } from '../../../src/redaction/builtin-rules.js';
import { compileRule } from '../../../src/redaction/engine.js';
import { isSafeRegex } from '../../../src/redaction/safe-regex-validator.js';
import { RedactionEngine } from '../../../src/redaction/engine.js';

function ruleEngine(id: string): RedactionEngine {
  const raw = BUILTIN_RULES.find((r) => r.id === id);
  if (!raw) throw new Error(`no rule ${id}`);
  const c = compileRule(raw);
  if (!c) throw new Error(`rule ${id} failed compile`);
  // Force mode → redact so the engine returns instead of throwing.
  return new RedactionEngine([{ ...c, mode: c.mode === 'block' ? 'redact' : c.mode }]);
}

function scan(id: string, text: string): number {
  const eng = ruleEngine(id);
  const { findings } = eng.scan(text, 'request');
  return findings.length === 0 ? 0 : findings[0].count;
}

describe('Built-in rules — safety check', () => {
  it('every pattern passes safe-regex', () => {
    const bad: string[] = [];
    for (const r of BUILTIN_RULES) {
      if (!isSafeRegex(r.pattern)) bad.push(`${r.id}: ${r.pattern}`);
    }
    expect(bad).toEqual([]);
  });

  it('every rule compiles', () => {
    for (const r of BUILTIN_RULES) {
      expect(compileRule(r), `compile ${r.id}`).not.toBeNull();
    }
  });

  it('rule ids are unique', () => {
    const ids = BUILTIN_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rule names are unique', () => {
    const names = BUILTIN_RULES.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('has 22+ rules covering all spec kinds', () => {
    expect(BUILTIN_RULES.length).toBeGreaterThanOrEqual(22);
  });
});

describe('Built-in rules — positive + negative matches', () => {
  it('aws_access_key', () => {
    expect(scan('aws_access_key', 'token AKIAIOSFODNN7EXAMPLE in env')).toBe(1);
    expect(scan('aws_access_key', 'no key here')).toBe(0);
  });

  it('github_pat', () => {
    expect(scan('github_pat', 'TOKEN=ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789')).toBe(1);
    expect(scan('github_pat', 'no token')).toBe(0);
  });

  it('gitlab_pat', () => {
    expect(scan('gitlab_pat', 'TOKEN=glpat-1234567890abcdefghij')).toBe(1);
    expect(scan('gitlab_pat', 'glpat- too short')).toBe(0);
  });

  it('anthropic_api_key', () => {
    const key = 'sk-ant-' + 'A'.repeat(95);
    expect(scan('anthropic_api_key', `key=${key}`)).toBe(1);
    expect(scan('anthropic_api_key', 'sk-ant-short')).toBe(0);
  });

  it('openai_api_key', () => {
    expect(scan('openai_api_key', 'OPENAI_API_KEY=sk-' + 'A'.repeat(48))).toBe(1);
    expect(scan('openai_api_key', 'no key')).toBe(0);
  });

  it('google_api_key', () => {
    expect(scan('google_api_key', 'k=AIza0123456789abcdefghijklmnopqrstuvwxy')).toBe(1);
    expect(scan('google_api_key', 'AIza too short')).toBe(0);
  });

  it('stripe_live (block mode kept via override-to-redact in helper)', () => {
    expect(scan('stripe_live', 'k=sk_live_' + 'a'.repeat(24))).toBe(1);
    expect(scan('stripe_live', 'sk_live_short')).toBe(0);
  });

  it('stripe_test', () => {
    expect(scan('stripe_test', 'pk_test_' + 'X'.repeat(24))).toBe(1);
    expect(scan('stripe_test', 'pk_test_short')).toBe(0);
  });

  it('slack_bot_token', () => {
    expect(scan('slack_bot_token', 'xoxb-1234567890-AbCdEfGhIj')).toBe(1);
    expect(scan('slack_bot_token', 'plain xox')).toBe(0);
  });

  it('npm_token', () => {
    expect(scan('npm_token', 'npm_' + 'A'.repeat(36))).toBe(1);
    expect(scan('npm_token', 'npm_short')).toBe(0);
  });

  it('jwt_bearer', () => {
    expect(scan('jwt_bearer', 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4f')).toBe(1);
    expect(scan('jwt_bearer', 'no jwt')).toBe(0);
  });

  it('private_key_pem', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----';
    expect(scan('private_key_pem', pem)).toBe(1);
    expect(scan('private_key_pem', '-----BEGIN PUBLIC KEY-----\nfoo\n-----END PUBLIC KEY-----')).toBe(0);
  });

  it('ssh_private_key', () => {
    const k = '-----BEGIN OPENSSH PRIVATE KEY-----\nblob\n-----END OPENSSH PRIVATE KEY-----';
    expect(scan('ssh_private_key', k)).toBe(1);
    expect(scan('ssh_private_key', 'not a key')).toBe(0);
  });

  it('pii_email', () => {
    expect(scan('pii_email', 'contact alice@example.com today')).toBe(1);
    expect(scan('pii_email', 'no addr here')).toBe(0);
  });

  it('pii_phone_us', () => {
    expect(scan('pii_phone_us', 'call (415) 555-1234 today')).toBeGreaterThan(0);
    expect(scan('pii_phone_us', 'no phone')).toBe(0);
  });

  it('pii_phone_intl', () => {
    expect(scan('pii_phone_intl', 'call +442071838750')).toBe(1);
    expect(scan('pii_phone_intl', 'no plus')).toBe(0);
  });

  it('pii_ssn_us', () => {
    expect(scan('pii_ssn_us', 'SSN: 123-45-6789')).toBe(1);
    expect(scan('pii_ssn_us', 'no ssn')).toBe(0);
  });

  it('pii_credit_card (Luhn validated)', () => {
    expect(scan('pii_credit_card', 'card 4242 4242 4242 4242')).toBe(1);
    // Invalid Luhn — must NOT count
    expect(scan('pii_credit_card', 'card 1234 5678 9012 3456')).toBe(0);
  });

  it('pii_ipv4_private', () => {
    expect(scan('pii_ipv4_private', 'addr 192.168.1.1 internal')).toBe(1);
    expect(scan('pii_ipv4_private', 'addr 8.8.8.8 public')).toBe(0);
  });

  it('db_url_with_creds', () => {
    expect(scan('db_url_with_creds', 'postgres://user:pass@host:5432/db')).toBe(1);
    expect(scan('db_url_with_creds', 'postgres://host:5432/db')).toBe(0);
  });

  it('dotenv_value', () => {
    expect(scan('dotenv_value', 'API_KEY=abcdefghijklmnop')).toBeGreaterThan(0);
    expect(scan('dotenv_value', 'DEBUG=true')).toBe(0);
  });
});
