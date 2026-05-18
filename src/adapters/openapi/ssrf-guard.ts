import { lookup } from 'node:dns/promises';

const PRIVATE_RANGES = [
  /^10\./, /^127\./, /^169\.254\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^::1$/, /^fc/, /^fd/, /^fe[89ab]/,
];

export interface SsrfPolicy {
  allowedDomains: string[];
  blockPrivateIps: boolean;
}

export interface SsrfResult {
  ok: boolean;
  reason?: string;
  resolvedIp?: string;
}

function isPrivate(ip: string): boolean {
  return PRIVATE_RANGES.some((re) => re.test(ip.toLowerCase()));
}

export async function checkUrl(rawUrl: string, policy: SsrfPolicy): Promise<SsrfResult> {
  let url: URL;
  try { url = new URL(rawUrl); }
  catch { return { ok: false, reason: 'invalid_url' }; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'unsupported_protocol' };
  }
  const host = url.hostname;
  if (policy.allowedDomains.length > 0) {
    const matches = policy.allowedDomains.some((d) =>
      host === d || host.endsWith(`.${d}`));
    if (!matches) return { ok: false, reason: 'not_in_allowlist' };
  }
  if (!policy.blockPrivateIps) return { ok: true };

  try {
    const { address } = await lookup(host);
    if (isPrivate(address)) return { ok: false, reason: 'private_ip', resolvedIp: address };
    return { ok: true, resolvedIp: address };
  } catch {
    return { ok: false, reason: 'dns_lookup_failed' };
  }
}
