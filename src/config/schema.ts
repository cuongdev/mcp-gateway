// ============================================================
// Configuration Schema - Zod validation
// Updated to follow MCPJungle patterns:
//   - Dev / Enterprise modes
//   - Server registration with transport configs
//   - Tool groups
//   - Bearer token auth for upstream servers
// ============================================================

import { z } from "zod";

// ── Upstream Server Transport Schemas ─────────────────

const HttpTransportSchema = z.object({
  type: z.enum(["streamable-http", "sse"]),
  url: z.string().url(),
  bearerToken: z.string().optional(),
  timeout: z.number().positive().default(30000),
  /**
   * Upstream MCP session mode (Streamable HTTP only).
   *   "stateful"  — persist `Mcp-Session-Id` across requests (default)
   *   "stateless" — never read or send the upstream session header
   */
  session_mode: z.enum(["stateful", "stateless"]).default("stateful"),
  /** Extra HTTP headers forwarded to the upstream on every request */
  headers: z.record(z.string()).default({}),
});

const StdioTransportSchema = z.object({
  type: z.literal("stdio"),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).optional(),
  stateful: z.boolean().default(false),
  idleTimeoutMs: z.number().positive().default(300000),
});

const OpenApiTransportSchema = z.object({
  type: z.literal("openapi"),
  specUrl: z.string().url().optional(),
  specPath: z.string().optional(),
  baseUrl: z.string().url().optional(),
  auth: z.object({
    type: z.enum(["bearer", "apiKey"]).optional(),
    token: z.string().optional(),
    headerName: z.string().optional(),
  }).optional(),
  filter: z.object({
    tags: z.array(z.string()).optional(),
    operationIds: z.array(z.string()).optional(),
    exclude: z.array(z.string()).optional(),
  }).optional(),
});

const TransportSchema = z.discriminatedUnion("type", [
  HttpTransportSchema,
  StdioTransportSchema,
  OpenApiTransportSchema,
]);

// ── Upstream Server Schema ────────────────────────────

export const UpstreamServerSchema = z.object({
  /** Server display name */
  name: z.string().min(1),
  /** Transport configuration */
  transport: TransportSchema,
  /** Whether to auto-discover tools on startup */
  autoDiscover: z.boolean().default(true),
  /** Retry policy for HTTP transports */
  retry: z.object({
    maxRetries: z.number().nonnegative().default(3),
    backoffMs: z.number().positive().default(1000),
  }).default({}),
  /** Health check config */
  healthCheck: z.object({
    enabled: z.boolean().default(true),
    intervalMs: z.number().positive().default(30000),
  }).default({}),
});

// ── Tool Group Schema ─────────────────────────────────

export const ToolGroupSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  /** Canonical tool names to include */
  tools: z.array(z.string()),
  /** Restrict to specific roles (empty = all) */
  allowedRoles: z.array(z.string()).optional(),
  /** Servers to include (auto-expanded to their tools at MCP serve time) */
  includedServers: z.array(z.string()).optional(),
  /** Canonical tool names to exclude after server expansion */
  excludedTools: z.array(z.string()).optional(),
});

// ── OIDC Provider Schema ─────────────────────────────
//
// Each provider is an independent OIDC/OAuth2 identity source.
// Examples: Google, Azure AD, GitHub, Auth0, Keycloak, Okta.

export const OIDCProviderSchema = z.object({
  /** Unique identifier used in URLs, e.g. "google", "azure" */
  id: z.string().min(1),
  /** Display name shown on the login page */
  name: z.string().min(1),
  /** OIDC discovery URL, e.g. https://accounts.google.com/.well-known/openid-configuration */
  discoveryUrl: z.string().url(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  /** OAuth2 scopes to request */
  scopes: z.array(z.string()).default(["openid", "profile", "email"]),
  /**
   * Accepted audiences for JWT validation.
   * Defaults to [clientId] if not set.
   */
  audiences: z.array(z.string()).optional(),
  /** JWT claim containing roles list */
  rolesClaim: z.string().default("roles"),
  /** JWT claim containing org/tenant ID */
  orgClaim: z.string().default("org_id"),
  /**
   * Map provider group/role names → gateway roles.
   * e.g. { "Engineering": ["admin"], "Viewer": ["user"] }
   */
  roleMappings: z.record(z.array(z.string())).default({}),
  /** Icon (url or data URI) shown on login button */
  icon: z.string().optional(),
});

// Keep backward-compat alias
export const OIDCConfigSchema = OIDCProviderSchema.extend({
  enabled: z.boolean().default(true),
  tokenCache: z.object({
    enabled: z.boolean().default(true),
    ttl: z.number().positive().default(300),
    maxSize: z.number().positive().default(1000),
  }).default({}),
});

// ── Authorization Schema ──────────────────────────────

export const AuthorizationConfigSchema = z.object({
  enabled: z.boolean().default(true),
  modelFile: z.string().default("./config/policy.model.conf"),
  policyFile: z.string().default("./config/policy.csv"),
  defaultDecision: z.enum(["deny", "allow"]).default("deny"),
  cache: z.object({
    enabled: z.boolean().default(true),
    ttl: z.number().positive().default(600),
  }).default({}),
});

// ── Storage Schema ────────────────────────────────────

export const StorageSchema = z.object({
  driver: z.enum(["sqlite", "postgres"]).default("sqlite"),
  path: z.string().default("./data/mcp.sqlite"),
  url: z.string().nullable().default(null),       // P1: Postgres DATABASE_URL
  authToken: z.string().nullable().default(null), // Turso (optional)
}).default({});

// ── Auth Schema ───────────────────────────────────────

export const AuthSchema = z.object({
  bearerTokenHeader: z.string().default("Authorization"),
  requireAuthForApi: z.boolean().optional(),      // resolved by transform per mode
  requireAuthForMcp: z.boolean().optional(),
  /**
   * Secret (≥32 chars) for signing the unified session cookie JWT.
   * When set, `sessionCookieMiddleware` is mounted ahead of bearer-token
   * authentication so OIDC-issued cookies authenticate the request.
   */
  sessionCookieSecret: z.string().min(32).optional(),
  /** Cookie name used by `sessionCookieMiddleware` (default `mcp_session`). */
  sessionCookieName: z.string().default("mcp_session"),
}).default({});

// ── Audit Schema ──────────────────────────────────────

export const AuditConfigSchema = z.object({
  enabled: z.boolean().default(true),
  storage: z.enum(["file", "console", "custom"]).default("file"),
  logPath: z.string().default("./logs/audit.jsonl"),
  maxFileSize: z.number().positive().default(10 * 1024 * 1024),
  retentionDays: z.number().positive().default(90),
  fileExport: z.boolean().default(false),
  fileExportPath: z.string().default("./logs/audit.jsonl"),
});

// ── Monitoring Schema ─────────────────────────────────

export const MonitoringConfigSchema = z.object({
  metricsEnabled: z.boolean().default(true),
  metricsPort: z.number().positive().default(9090),
  metricsPath: z.string().default("/metrics"),
  healthCheckPath: z.string().default("/health"),
});

// ── Quota Schema ──────────────────────────────────────

const QuotaOverrideSchema = z.object({
  principalType: z.enum(['user', 'service_account', 'mcp_client']).optional(),
  principalId: z.string().optional(),
  daily: z.number().int().positive().optional(),
  monthly: z.number().int().positive().optional(),
});

const QuotaSchema = z.object({
  enabled: z.boolean().default(true),
  default: z.object({
    daily: z.number().int().positive().optional(),
    monthly: z.number().int().positive().optional(),
  }).default({ daily: 10000, monthly: 200000 }),
  overrides: z.array(QuotaOverrideSchema).default([]),
}).default({});

// ── Rate Limit Schema ─────────────────────────────────

const RateLimitRuleSchema = z.object({
  principalType: z.enum(['user', 'service_account', 'mcp_client']).optional(),
  principalId: z.string().optional(),
  tool: z.string().optional(),
  limit: z.string().regex(/^\d+\/(sec|second|min|minute|hour|hr|day|d)$/),
});

const RateLimitSchema = z.object({
  enabled: z.boolean().default(true),
  backend: z.enum(['memory', 'redis']).default('memory'),
  redisUrl: z.string().nullable().default(null),
  default: z.string().regex(/^\d+\//).default('1000/min'),
  rules: z.array(RateLimitRuleSchema).default([]),
}).default({});

// ── Cache Schema ──────────────────────────────────────

const CacheSchema = z.object({
  enabled: z.boolean().default(true),
  backend: z.enum(['memory', 'redis', 'sql']).default('memory'),
  redisUrl: z.string().nullable().default(null),
  maxEntries: z.number().int().positive().default(10000),
  defaultTtlSec: z.number().int().positive().default(60),
}).default({});

// ── Approval Schema ───────────────────────────────────

const ApprovalSchema = z.object({
  enabled: z.boolean().default(false),
  defaultTtlSec: z.number().int().positive().default(300),
  approverRoles: z.array(z.string()).default(['admin']),
  tokenSecret: z.string().min(32).optional(),
}).default({});

// ── Webhook Schema ────────────────────────────────────

const WebhookConfigSchema = z.object({
  enabled: z.boolean().default(true),
  workerPollIntervalMs: z.number().int().positive().default(2000),
  workerConcurrency: z.number().int().positive().default(4),
  maxAttempts: z.number().int().positive().default(5),
  backoffMs: z.array(z.number().int().nonnegative()).default([1000, 5000, 30000, 120000, 600000]),
}).default({});

// ── Tracing Schema ────────────────────────────────────

const TracingSchema = z.object({
  enabled: z.boolean().default(false),
  serviceName: z.string().default('mcp-gateway'),
  otlpEndpoint: z.string().nullable().default(null),
  samplingRatio: z.number().min(0).max(1).default(0.1),
}).default({});

// ── Proxy Schema ──────────────────────────────────────

const ProxyConfigSchema = z.object({
  /**
   * Name of the proxy used by default when neither the server nor the
   * group specifies one. `null` means no default proxy (direct connect).
   */
  defaultName: z.string().nullable().default(null),
}).default({});

// ── Tenancy Schema ────────────────────────────────────

const TenancySchema = z.object({
  enabled: z.boolean().default(false),
  headerName: z.string().default('X-Tenant'),
  defaultSlug: z.string().default('default'),
  suspendedHttpStatus: z.number().int().min(400).max(599).default(402),
}).default({});

// ── OpenAPI Schema ───────────────────────────────────

const OpenApiConfigSchema = z.object({
  enabled: z.boolean().default(true),
  allowedDomains: z.array(z.string()).default([]),
  blockPrivateIps: z.boolean().default(true),
  maxResponseBytes: z.number().int().positive().default(10_000_000),
}).default({});

// ── Session Schema ────────────────────────────────────

export const SessionConfigSchema = z.object({
  /**
   * Secret key for signing session JWTs (HttpOnly cookie).
   * Falls back to GATEWAY_SESSION_SECRET env var.
   * In enterprise mode, this MUST be set explicitly.
   */
  secret: z.string().min(32).optional(),
  /** Session cookie name */
  cookieName: z.string().default("mcp_session"),
  /** Session TTL in seconds (default 8 hours) */
  ttl: z.number().positive().default(28800),
  /** Secure flag on cookie (auto-true in enterprise) */
  secure: z.boolean().default(false),
  /** SameSite cookie policy */
  sameSite: z.enum(["strict", "lax", "none"]).default("lax"),
  /**
   * Idle timeout (in seconds) for upstream stateful sessions.
   * After this many seconds without activity, the session is reclaimed
   * (e.g. STDIO child processes killed, HTTP `Mcp-Session-Id` cleared).
   * Default: 600s (10 minutes).
   */
  idleTimeoutSec: z.number().int().positive().default(600),
});

// ── Main Gateway Config ───────────────────────────────

export const GatewayConfigSchema = z.object({
  /**
   * Running mode:
   *   "development" — no auth, full access, SQLite-friendly
   *   "enterprise"  — OIDC required, strict ACL, metrics on
   */
  mode: z.enum(["development", "enterprise"]).default("development"),

  gateway: z.object({
    port: z.number().positive().default(3000),
    host: z.string().default("0.0.0.0"),
    /** Public base URL (used in OAuth2 redirect_uri). Required in enterprise mode. */
    publicUrl: z.string().url().optional(),
    /** Base path for MCP endpoint */
    mcpPath: z.string().default("/mcp"),
    /** Base path for admin/REST API */
    apiPath: z.string().default("/api"),
    corsOrigins: z.array(z.string()).default(["*"]),
    requestTimeout: z.number().positive().default(30000),
    /**
     * Apply redaction rules to BOTH legs of a reverse-channel call
     * (upstream-initiated sampling/createMessage → client, and the client's
     * response → upstream). Off by default: opt in once redaction rules are
     * tuned, since a block-mode match will refuse the reverse call. Harmless
     * when no rules are configured (scan is a no-op).
     */
    reverseChannelRedaction: z.boolean().default(false),
  }).default({}),

  /**
   * OIDC providers for authentication.
   * Multiple providers supported (Google, Azure, GitHub, Auth0…).
   * Required in enterprise mode.
   */
  oidcProviders: z.array(OIDCProviderSchema).default([]),

  /** (Legacy) single OIDC config — migrated to oidcProviders[0] automatically */
  oidc: OIDCConfigSchema.optional(),

  /** Session cookie config for dashboard login */
  session: SessionConfigSchema.default({}),

  /** Casbin authorization */
  authorization: AuthorizationConfigSchema.default({}),

  /** Upstream MCP servers to register on startup */
  servers: z.array(UpstreamServerSchema).default([]),

  /** Pre-configured tool groups */
  groups: z.array(ToolGroupSchema).default([]),

  audit: AuditConfigSchema.default({}),

  monitoring: MonitoringConfigSchema.default({}),

  storage: StorageSchema,

  auth: AuthSchema,

  rateLimit: RateLimitSchema,

  quota: QuotaSchema,

  cache: CacheSchema,

  approval: ApprovalSchema,

  webhooks: WebhookConfigSchema,

  tracing: TracingSchema,

  openapi: OpenApiConfigSchema,

  proxy: ProxyConfigSchema,

  tenancy: TenancySchema,
}).transform((cfg) => {
  if (cfg.auth.requireAuthForApi === undefined) {
    cfg.auth.requireAuthForApi = cfg.mode !== "development";
  }
  if (cfg.auth.requireAuthForMcp === undefined) {
    cfg.auth.requireAuthForMcp = cfg.mode !== "development";
  }
  return cfg;
}).superRefine((cfg, ctx) => {
  if (cfg.oidcProviders.length > 0 && !cfg.auth.sessionCookieSecret) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["auth", "sessionCookieSecret"],
      message:
        "auth.sessionCookieSecret is required when oidcProviders are configured (P2 unification)",
    });
  }
  if (cfg.approval.enabled && !cfg.approval.tokenSecret) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["approval", "tokenSecret"],
      message: "approval.tokenSecret (>=32 chars) required when approval.enabled",
    });
  }
});

// ── Derived Types ─────────────────────────────────────

export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;
export type OIDCConfig = z.infer<typeof OIDCConfigSchema>;
export type OIDCProvider = z.infer<typeof OIDCProviderSchema>;
export type SessionConfig = z.infer<typeof SessionConfigSchema>;
export type AuthorizationConfig = z.infer<typeof AuthorizationConfigSchema>;
export type UpstreamServer = z.infer<typeof UpstreamServerSchema>;
export type AuditConfig = z.infer<typeof AuditConfigSchema>;
export type MonitoringConfig = z.infer<typeof MonitoringConfigSchema>;
export type ToolGroupConfig = z.infer<typeof ToolGroupSchema>;
export type TransportConfig = z.infer<typeof TransportSchema>;
export type StorageConfig = z.infer<typeof StorageSchema>;
export type AuthConfig = z.infer<typeof AuthSchema>;
export type RateLimitConfig = z.infer<typeof RateLimitSchema>;
export type QuotaConfig = z.infer<typeof QuotaSchema>;
export type CacheConfig = z.infer<typeof CacheSchema>;
export type ApprovalConfig = z.infer<typeof ApprovalSchema>;
export type WebhookConfig = z.infer<typeof WebhookConfigSchema>;
export type TracingConfig = z.infer<typeof TracingSchema>;
export type OpenApiConfig = z.infer<typeof OpenApiConfigSchema>;
export type ProxyConfig = z.infer<typeof ProxyConfigSchema>;
export type TenancyConfig = z.infer<typeof TenancySchema>;
