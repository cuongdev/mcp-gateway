import type { PrincipalRow, PrincipalType } from '../storage/repositories/principal.repo.js';

export type AuthMethod = 'oidc' | 'token' | 'none';

export interface Principal {
  id: string;
  type: PrincipalType;
  displayName: string;
  disabled: boolean;
  authMethod: AuthMethod;
  email?: string;
  allowedServers?: string[];
  isBootstrap?: boolean;
}

export function toPrincipal(row: PrincipalRow, authMethod: AuthMethod): Principal {
  return {
    id: row.id,
    type: row.type,
    displayName: row.displayName,
    disabled: row.disabled,
    authMethod,
    email: row.email,
    allowedServers: row.allowedServers,
    isBootstrap: row.isBootstrap,
  };
}

export function isUser(p: Principal): boolean { return p.type === 'user'; }
export function isServiceAccount(p: Principal): boolean { return p.type === 'service_account'; }
export function isMCPClient(p: Principal): boolean { return p.type === 'mcp_client'; }

export function anonymousDev(): Principal {
  return {
    id: 'dev',
    type: 'service_account',
    displayName: 'dev',
    disabled: false,
    authMethod: 'none',
  };
}
