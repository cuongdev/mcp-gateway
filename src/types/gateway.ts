// ============================================================
// Gateway Types - Core type definitions
// ============================================================

/** User context extracted from OIDC token */
export interface UserContext {
  /** Subject (user ID from OIDC) */
  sub: string;
  /** Email address */
  email?: string;
  /** Display name */
  name?: string;
  /** Organization ID */
  orgId?: string;
  /** Assigned roles */
  roles: string[];
  /** Raw token claims */
  claims: Record<string, unknown>;
  /** Token issuer */
  issuer: string;
  /** Token expiration timestamp */
  expiresAt: number;
}

/** MCP JSON-RPC request message */
export interface MCPRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

/** MCP JSON-RPC response message */
export interface MCPResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/** MCP JSON-RPC notification (no id) */
export interface MCPNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

export type MCPMessage = MCPRequest | MCPResponse | MCPNotification;

/** Gateway request context — flows through all middleware */
export interface GatewayContext {
  /** Unique request ID */
  requestId: string;
  /** Timestamp of request arrival */
  timestamp: Date;
  /** Authenticated user (set by auth middleware) */
  user?: UserContext;
  /** Original MCP message */
  mcpMessage?: MCPRequest;
  /** Target upstream server name */
  targetServer?: string;
  /** Authorization decision details */
  authzDecision?: AuthzDecision;
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

/** Authorization decision */
export interface AuthzDecision {
  allowed: boolean;
  matchedPolicy?: string;
  evaluationTimeMs: number;
  reason?: string;
  model: "rbac" | "abac" | "rebac";
}

/** Upstream MCP server configuration */
export interface UpstreamServerConfig {
  /** Server name (identifier) */
  name: string;
  /** Server URL for HTTP-based transports */
  url: string;
  /** Transport type */
  transport: "streamable-http" | "sse" | "stdio";
  /** Request timeout in ms */
  timeout: number;
  /** Tools this server provides (for routing) */
  tools?: string[];
  /** Retry policy */
  retry: {
    maxRetries: number;
    backoffMs: number;
  };
  /** Health check config */
  healthCheck: {
    enabled: boolean;
    intervalMs: number;
  };
}

/** Audit log entry */
export interface AuditEntry {
  id: string;
  timestamp: string;
  requestId: string;
  userId?: string;
  userEmail?: string;
  userOrg?: string;
  action: string;
  method?: string;
  toolName?: string;
  targetServer?: string;
  authorization: {
    decision: "ALLOW" | "DENY" | "SKIP";
    matchedPolicy?: string;
    evaluationTimeMs?: number;
    model?: string;
  };
  result: {
    status: "success" | "error" | "timeout";
    responseTimeMs: number;
    errorCode?: string;
    errorMessage?: string;
  };
  metadata: {
    ipAddress?: string;
    userAgent?: string;
    [key: string]: unknown;
  };
}

/** Server health status */
export interface ServerHealth {
  name: string;
  status: "healthy" | "unhealthy" | "unknown";
  lastCheck: Date;
  latencyMs?: number;
  consecutiveFailures: number;
}
