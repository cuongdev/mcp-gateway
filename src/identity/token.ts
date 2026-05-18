import { randomBytes } from 'node:crypto';
import { base32 } from '@scure/base';

export type TokenType = 'pat' | 'sat' | 'mct';
export type TokenEnv = 'live' | 'test' | 'dev';

/** Length of the longest header: 'mcp_sat_live_' = 13 */
export const TOKEN_HEADER_LEN = 13;
export const TOKEN_SECRET_LEN = 32;  // base32 of 20 random bytes
export const TOKEN_PREFIX_LEN = 21;  // TOKEN_HEADER_LEN + first 8 secret chars

const VALID_TYPES = new Set<TokenType>(['pat', 'sat', 'mct']);
const VALID_ENVS = new Set<TokenEnv>(['live', 'test', 'dev']);

/** Compute the header length for a given type+env pair */
function headerLen(type: string, env: string): number {
  return `mcp_${type}_${env}_`.length;
}

export interface ParsedToken {
  raw: string;
  type: TokenType;
  env: TokenEnv;
  prefix: string;
  secret: string;
}

export function generateToken(type: TokenType, env: TokenEnv = 'live'): string {
  if (!VALID_TYPES.has(type)) throw new Error(`Invalid type: ${type}`);
  if (!VALID_ENVS.has(env)) throw new Error(`Invalid env: ${env}`);
  const bytes = randomBytes(20);  // 160 bits → 32 base32 chars
  const secret = base32.encode(bytes).replace(/=/g, '').toUpperCase().slice(0, TOKEN_SECRET_LEN);
  return `mcp_${type}_${env}_${secret}`;
}

export function parseToken(raw: string): ParsedToken | null {
  if (typeof raw !== 'string') return null;
  const parts = raw.split('_');
  if (parts.length !== 4) return null;
  const [head, type, env, secret] = parts;
  if (head !== 'mcp') return null;
  if (!VALID_TYPES.has(type as TokenType)) return null;
  if (!VALID_ENVS.has(env as TokenEnv)) return null;
  if (secret.length !== TOKEN_SECRET_LEN) return null;
  if (!/^[A-Z2-7]+$/.test(secret)) return null;
  const hLen = headerLen(type, env);
  if (raw.length !== hLen + TOKEN_SECRET_LEN) return null;
  return {
    raw,
    type: type as TokenType,
    env: env as TokenEnv,
    prefix: raw.slice(0, hLen + 8),
    secret,
  };
}

export function computePrefix(raw: string): string {
  return raw.slice(0, TOKEN_PREFIX_LEN);
}
