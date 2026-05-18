import { describe, it, expect } from 'vitest';
import { signApprovalToken, verifyApprovalToken } from '../../../src/approval/token.js';

const SECRET = 'test-secret-for-approval-tokens-must-be-long';

describe('approval token', () => {
  it('signs and verifies', () => {
    const exp = Date.now() + 60_000;
    const tok = signApprovalToken('app_1', exp, SECRET);
    const v = verifyApprovalToken(tok, SECRET);
    expect(v?.approvalId).toBe('app_1');
    expect(v?.expiresAtMs).toBe(exp);
  });

  it('rejects expired tokens', () => {
    const tok = signApprovalToken('app_1', Date.now() - 1000, SECRET);
    expect(verifyApprovalToken(tok, SECRET)).toBeNull();
  });

  it('rejects tokens signed with a different secret', () => {
    const tok = signApprovalToken('app_1', Date.now() + 60_000, SECRET);
    expect(verifyApprovalToken(tok, 'wrong-secret-must-also-be-long-enough')).toBeNull();
  });

  it('rejects tampered tokens', () => {
    const tok = signApprovalToken('app_1', Date.now() + 60_000, SECRET);
    const tampered = Buffer.from(Buffer.from(tok, 'base64url').toString('utf8').replace('app_1', 'app_2'), 'utf8').toString('base64url');
    expect(verifyApprovalToken(tampered, SECRET)).toBeNull();
  });
});
