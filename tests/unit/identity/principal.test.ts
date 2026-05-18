import { describe, it, expect } from 'vitest';
import {
  toPrincipal, isUser, isServiceAccount, isMCPClient, anonymousDev,
} from '../../../src/identity/principal.js';
import type { PrincipalRow } from '../../../src/storage/repositories/principal.repo.js';

const userRow: PrincipalRow = {
  id: 'p1', type: 'user', displayName: 'alice', disabled: false,
  createdAt: 0, email: 'alice@example.com',
};
const saRow: PrincipalRow = {
  id: 'p2', type: 'service_account', displayName: 'admin', disabled: false,
  createdAt: 0, isBootstrap: true,
};
const mcRow: PrincipalRow = {
  id: 'p3', type: 'mcp_client', displayName: 'claude', disabled: false,
  createdAt: 0, allowedServers: ['db'],
};

describe('principal', () => {
  it('toPrincipal maps PrincipalRow + authMethod', () => {
    const p = toPrincipal(userRow, 'oidc');
    expect(p.id).toBe('p1');
    expect(p.authMethod).toBe('oidc');
    expect(p.email).toBe('alice@example.com');
  });

  it('type guards', () => {
    expect(isUser(toPrincipal(userRow, 'oidc'))).toBe(true);
    expect(isServiceAccount(toPrincipal(saRow, 'token'))).toBe(true);
    expect(isMCPClient(toPrincipal(mcRow, 'token'))).toBe(true);
    expect(isUser(toPrincipal(saRow, 'token'))).toBe(false);
  });

  it('anonymousDev returns a stable dev principal', () => {
    const a = anonymousDev();
    const b = anonymousDev();
    expect(a.id).toBe('dev');
    expect(a.type).toBe('service_account');
    expect(a.authMethod).toBe('none');
    expect(a).toEqual(b);
  });
});
