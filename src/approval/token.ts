import { createHmac, timingSafeEqual } from 'node:crypto';

export function signApprovalToken(approvalId: string, expiresAtMs: number, secret: string): string {
  const payload = `${approvalId}.${expiresAtMs}`;
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}

export interface VerifiedApprovalToken {
  approvalId: string;
  expiresAtMs: number;
}

export function verifyApprovalToken(token: string, secret: string): VerifiedApprovalToken | null {
  let decoded: string;
  try { decoded = Buffer.from(token, 'base64url').toString('utf8'); }
  catch { return null; }
  const parts = decoded.split('.');
  if (parts.length !== 3) return null;
  const [approvalId, expStr, sig] = parts;
  const exp = parseInt(expStr, 10);
  if (Number.isNaN(exp) || exp < Date.now()) return null;
  const expectedSig = createHmac('sha256', secret).update(`${approvalId}.${exp}`).digest('hex');
  const sigBuf = Buffer.from(sig, 'hex');
  const expBuf = Buffer.from(expectedSig, 'hex');
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
  return { approvalId, expiresAtMs: exp };
}
