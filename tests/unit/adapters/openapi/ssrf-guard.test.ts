import { describe, it, expect } from 'vitest';
import { checkUrl } from '../../../../src/adapters/openapi/ssrf-guard.js';

describe('SSRF guard', () => {
  it('rejects 10.x.x.x', async () => {
    const r = await checkUrl('http://10.0.0.1/foo', { allowedDomains: [], blockPrivateIps: true });
    expect(r.ok).toBe(false);
  });

  it('rejects 127.0.0.1', async () => {
    const r = await checkUrl('http://127.0.0.1', { allowedDomains: [], blockPrivateIps: true });
    expect(r.ok).toBe(false);
  });

  it('allows public IPs', async () => {
    // 8.8.8.8 is a literal IP — lookup() resolves trivially without external DNS
    const r = await checkUrl('http://8.8.8.8', { allowedDomains: [], blockPrivateIps: true });
    expect(r.ok).toBe(true);
  });

  it('respects allowedDomains', async () => {
    const r = await checkUrl('http://internal.example.com', { allowedDomains: ['example.com'], blockPrivateIps: false });
    expect(r.ok).toBe(true);
  });

  it('rejects unknown domains when allowlist set', async () => {
    const r = await checkUrl('http://evil.com', { allowedDomains: ['example.com'], blockPrivateIps: false });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('not_in_allowlist');
  });

  it('rejects unsupported protocols', async () => {
    const r = await checkUrl('file:///etc/passwd', { allowedDomains: [], blockPrivateIps: true });
    expect(r.ok).toBe(false);
  });
});
