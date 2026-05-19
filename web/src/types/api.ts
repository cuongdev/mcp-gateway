export interface AuthMe {
  principalId: string;
  type: 'user' | 'service_account' | 'mcp_client';
  email: string | null;
  displayName: string;
  /** Casbin role bindings for this principal (Phase C). */
  roles: string[];
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
  enabled: boolean;
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

// ── Phase C types ────────────────────────────────────

export interface User {
  principalId: string;
  email: string;
  displayName: string;
  disabled: boolean;
  createdAt: number;
}

export interface McpClient {
  principalId: string;
  name: string;
  description?: string;
  allowedServers: string[];
  disabled: boolean;
  createdAt: number;
}

export interface PatToken {
  id: string;
  prefix: string;
  name?: string;
  createdAt: number;
  lastUsedAt?: number;
  expiresAt?: number;
}

export interface PromptSummary {
  canonicalName: string;
  serverName: string;
  originalName: string;
  description?: string;
  argumentsSchema?: Record<string, unknown>;
  enabled: boolean;
}

// ── Phase D types ────────────────────────────────────

export interface RateLimitRule {
  principalType?: 'user' | 'service_account' | 'mcp_client';
  principalId?: string;
  tool?: string;
  limit: string;
}

export interface RateLimitStatus {
  enabled: boolean;
  backend: 'memory' | 'redis';
  default: string;
  rules: RateLimitRule[];
}

export interface QuotaStatus {
  daily: { used: number; limit?: number };
  monthly: { used: number; limit?: number };
}

export interface Approval {
  id: string;
  tsRequested: number;
  tsDecided: number | null;
  tsExpires: number;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'executed' | 'failed';
  principalId: string;
  tool: string;
  argsJson: string;
  argsHash: string;
  approverId: string | null;
  decisionReason: string | null;
  resultJson: string | null;
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
  secret: string | null;
  events: string[];
  enabled: boolean;
  createdAt: number;
}

// ── Phase E types ────────────────────────────────────

export interface Proxy {
  id: string;
  name: string;
  url: string;
  description: string | null;
  enabled: boolean;
  createdAt: number;
}

export interface ProxyReference {
  kind: 'server' | 'group';
  name: string;
}

export interface Tenant {
  id: string;
  slug: string;
  displayName: string;
  plan: string;
  status: 'active' | 'suspended' | 'pending';
  createdAt: number;
  metadata: Record<string, unknown>;
}

export interface ServerHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  transport: string;
  lastChecked?: string;
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  timestamp: string;
  servers: ServerHealth[];
}

/** Opaque GatewayConfig for the Settings page — displayed as JSON. */
export type GatewayConfig = Record<string, unknown>;

export interface AuditEntry {
  id: string;
  ts: number;
  principalId?: string;
  principalType?: string;
  action: string;
  resource?: string;
  result: 'success' | 'denied' | 'error';
  durationMs?: number;
  metadata?: Record<string, unknown>;
}
