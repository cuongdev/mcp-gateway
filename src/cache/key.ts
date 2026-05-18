import { createHash } from 'node:crypto';

function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  const keys = Object.keys(v as object).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical((v as Record<string, unknown>)[k])).join(',') + '}';
}

export function cacheKey(canonicalToolName: string, args: unknown, principalId?: string): string {
  const input = `${canonicalToolName}|${canonical(args)}|${principalId ?? ''}`;
  return createHash('sha256').update(input).digest('hex');
}
