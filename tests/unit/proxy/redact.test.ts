import { describe, it, expect } from 'vitest';
import { redactProxyUrl } from '../../../src/proxy/redact.js';

describe('redactProxyUrl', () => {
  it('redacts password in user:pass@host form', () => {
    expect(redactProxyUrl('http://admin:s3cret@corp:8080'))
      .toBe('http://admin:***@corp:8080');
  });

  it('redacts password with HTTPS', () => {
    expect(redactProxyUrl('https://admin:p_ss@corp:443'))
      .toBe('https://admin:***@corp:443');
  });

  it('redacts password for SOCKS', () => {
    expect(redactProxyUrl('socks5://user:secret@host:1080'))
      .toBe('socks5://user:***@host:1080');
  });

  it('idempotent on already-redacted', () => {
    expect(redactProxyUrl('http://admin:***@corp:8080'))
      .toBe('http://admin:***@corp:8080');
  });

  it('leaves URLs without credentials untouched', () => {
    expect(redactProxyUrl('http://corp:8080')).toBe('http://corp:8080');
  });

  it('leaves bare username (no password) untouched', () => {
    expect(redactProxyUrl('http://admin@corp:8080')).toBe('http://admin@corp:8080');
  });
});
