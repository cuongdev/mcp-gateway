export interface AuthMe {
  principalId: string;
  type: 'user' | 'service_account' | 'mcp_client';
  email: string | null;
  displayName: string;
  /** Populated by Phase C backend change; empty until then. */
  roles?: string[];
}

export interface AuthProvider {
  id: string;
  name: string;
  icon?: string;
  loginUrl: string;
}

export interface ServerSummary {
  name: string;
  tools: string[];
  session: boolean;
}

export interface ToolSummary {
  name: string;
  server: string;
  originalName: string;
  description?: string;
  enabled: boolean;
  cacheable: boolean;
  cacheTtlSec: number | null;
  cachePerPrincipal: boolean;
  sensitive: boolean;
}

export interface GroupSummary {
  name: string;
  description?: string;
  tools: string[];
  allowedRoles?: string[];
  includedServers?: string[];
  excludedTools?: string[];
}

// ── Phase B types ────────────────────────────────────

export type ServerTransport =
  | { type: 'streamable-http' | 'sse'; url: string; bearerToken?: string; timeout?: number; session_mode?: 'stateful' | 'stateless'; headers?: Record<string, string> }
  | { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string>; stateful?: boolean; idleTimeoutMs?: number }
  | {
      type: 'openapi';
      specUrl?: string;
      specPath?: string;
      baseUrl?: string;
      auth?: { type?: 'bearer' | 'apiKey'; token?: string; headerName?: string };
      filter?: { tags?: string[]; operationIds?: string[]; exclude?: string[] };
    };

export interface RegisterServerBody {
  name: string;
  transport: ServerTransport;
  proxyName?: string | null;
}

export interface GroupDetail {
  name: string;
  description: string;
  tools: string[];
  enabled: boolean;
  allowedRoles: string[];
  createdAt: number;
  includedServers: string[];
  excludedTools: string[];
  proxyName?: string;
}

/** Casbin p-rule as tuple `[subject, object, action]`. */
export type Policy = [string, string, string];

export interface RoleBinding {
  user: string;
  role: string;
}

export interface UsageBucket {
  key: string;
  total: number;
  success: number;
  denied: number;
  error: number;
}

export interface UsageResponse {
  range: { since?: number; until?: number };
  by: 'tool' | 'principal' | 'server';
  action: string;
  series: UsageBucket[];
}
