// ============================================================
// MCP Gateway — Main Application
//
// Follows MCPJungle architecture:
//
//   Developers ──HTTP──▸ ┌──────────────────────┐
//                        │  HTTP API (/api/*)    │──▸ Admin REST
//                        │──────────────────────│
//   AI Agents ──MCP───▸  │  Gateway MCP Server  │──▸ Upstream
//   (Claude, Cursor)     │  (/mcp, /mcp/groups) │    MCP Servers
//                        └──────────────────────┘
//
// Two separate interfaces on the same port:
//   /api/*  — REST API for developers (management, monitoring)
//   /mcp    — MCP JSON-RPC for AI agents (tool discovery & call)
// ============================================================

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import type { GatewayConfig } from "./config/schema.js";
import type { GatewayVariables } from "./middleware/types.js";
import type { StorageAdapter } from "./storage/adapter.js";
import { GatewayError } from "./types/errors.js";
import { buildMiddlewarePipeline } from "./middleware/index.js";
import { ToolRegistry } from "./registry/tool.registry.js";
import { ToolGroupManager } from "./registry/tool.groups.js";
import { PromptRegistry } from "./registry/prompt.registry.js";
import { SessionManager } from "./session/session.manager.js";
import { PolicyEngine } from "./middleware/authz/policy.engine.js";
import { AuditLogger } from "./middleware/audit/audit.logger.js";
import { createMCPRoutes } from "./routes/mcp.routes.js";
import { createAdminRoutes } from "./routes/admin.routes.js";
import { createAuthRoutes } from "./routes/auth.routes.js";
import { createRateLimiter, type RateLimiter } from "./ratelimit/index.js";
import { rateLimitMiddleware } from "./middleware/rate-limit/rate-limit.middleware.js";
import { QuotaService } from "./quota/index.js";
import { quotaMiddleware } from "./middleware/quota/quota.middleware.js";
import { dayScope } from "./quota/periods.js";
import { createToolCache } from "./cache/index.js";
import { cacheMiddleware } from "./middleware/cache/cache.middleware.js";
import { createCacheRoutes } from "./routes/admin/cache.routes.js";
import { createRateLimitRoutes } from "./routes/admin/rate-limit.routes.js";
import { createQuotaRoutes } from "./routes/admin/quota.routes.js";
import { ApprovalService } from "./approval/index.js";
import { approvalGateMiddleware } from "./middleware/approval/approval-gate.middleware.js";
import { createApprovalsRoutes } from "./routes/admin/approvals.routes.js";
import { WebhookDispatcher } from "./notify/webhook.dispatcher.js";
import type { ToolCache } from "./cache/interface.js";
import { logger } from "./utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = logger.child({ component: "gateway" });

export class Gateway {
  private app: Hono<{ Variables: GatewayVariables }>;
  private config: GatewayConfig;
  private storage: StorageAdapter;
  private server: ReturnType<typeof serve> | null = null;

  // ── Core services ──────────────────────────────────
  private toolRegistry: ToolRegistry;
  private toolGroups: ToolGroupManager;
  private promptRegistry: PromptRegistry;
  private sessionManager: SessionManager;
  private policyEngine: PolicyEngine;
  private auditLogger: AuditLogger;
  private rateLimiter?: RateLimiter;
  private quotaService?: QuotaService;
  private quotaSweepInterval?: ReturnType<typeof setInterval>;
  private toolCache?: ToolCache;
  private approvalService?: ApprovalService;
  private approvalSweepInterval?: ReturnType<typeof setInterval>;
  private webhookDispatcher?: WebhookDispatcher;

  constructor(config: GatewayConfig, storage: StorageAdapter) {
    this.config = config;
    this.storage = storage;
    this.app = new Hono<{ Variables: GatewayVariables }>();

    // Initialize core services backed by storage
    this.toolRegistry = new ToolRegistry(storage);
    this.toolGroups = new ToolGroupManager(storage, this.toolRegistry);
    this.promptRegistry = new PromptRegistry(storage);
    this.sessionManager = new SessionManager();
    this.policyEngine = new PolicyEngine({
      storage,
      modelFile: config.authorization.modelFile,
    });
    this.auditLogger = new AuditLogger({
      storage,
      config: config.audit,
    });

    this.setupErrorHandler();
    this.setupMiddleware();
    this.setupRoutes();
  }

  // ── Setup ──────────────────────────────────────────

  private setupErrorHandler() {
    this.app.onError((err, c) => {
      if (err instanceof GatewayError) {
        log.warn(
          { code: err.code, status: err.statusCode, message: err.message },
          "Gateway error"
        );
        return c.json(err.toJSON(), err.statusCode as any);
      }

      log.error({ err }, "Unhandled error");
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "An internal error occurred" } },
        500
      );
    });
  }

  private setupMiddleware() {
    buildMiddlewarePipeline(this.app, this.config, { storage: this.storage });
  }

  private setupRoutes() {
    const { mcpPath, apiPath } = this.config.gateway;

    // ── MCP Routes (for AI agents / MCP clients) ─────
    const mcpRoutes = createMCPRoutes({
      toolRegistry: this.toolRegistry,
      toolGroups: this.toolGroups,
      sessionManager: this.sessionManager,
      promptRegistry: this.promptRegistry,
    });
    this.app.route(mcpPath, mcpRoutes);

    log.info({ path: mcpPath }, "MCP Gateway endpoint mounted");
    log.info({ path: `${mcpPath}/groups/:name` }, "MCP Group endpoints mounted");

    // ── Auth Routes (OIDC login/callback/logout) ─────
    const authRoutes = createAuthRoutes(this.config, { storage: this.storage });
    this.app.route("/auth", authRoutes);
    log.info({ providers: this.config.oidcProviders.map((p) => p.id) }, "Auth routes mounted at /auth");

    // ── Admin REST API (for developers) ──────────────
    // Cache-dependent admin routes are mounted in start() after async cache init.
    const adminRoutes = createAdminRoutes({
      config: this.config,
      storage: this.storage,
      toolRegistry: this.toolRegistry,
      toolGroups: this.toolGroups,
      sessionManager: this.sessionManager,
      promptRegistry: this.promptRegistry,
    });
    this.app.route(apiPath, adminRoutes);

    log.info({ path: apiPath }, "Admin API mounted");

    // ── Dashboard (admin web UI) ────────────────────
    this.setupDashboard();
  }

  /**
   * Serve the admin dashboard SPA.
   * GET /dashboard  → serves index.html
   * GET /           → redirects to /dashboard
   */
  private setupDashboard() {
    // Read dashboard HTML at startup (single file SPA)
    let dashboardHtml: string;
    try {
      const dashboardPath = resolve(__dirname, "dashboard", "index.html");
      dashboardHtml = readFileSync(dashboardPath, "utf-8");
      log.info("Dashboard loaded from src/dashboard/index.html");
    } catch {
      log.warn("Dashboard HTML not found — /dashboard will return 404");
      return;
    }

    this.app.get("/dashboard", (c) => {
      return c.html(dashboardHtml);
    });

    // Also serve at /dashboard/* for SPA client-side routing
    this.app.get("/dashboard/*", (c) => {
      return c.html(dashboardHtml);
    });

    // Redirect root to dashboard
    this.app.get("/", (c) => {
      return c.redirect("/dashboard");
    });

    log.info({ path: "/dashboard" }, "Admin Dashboard mounted");
  }

  // ── Lifecycle ──────────────────────────────────────

  /**
   * Start the gateway.
   * 1. Hydrate tool registry, tool groups, sessions from storage
   * 2. Load authorization policies from storage
   * 3. Start HTTP server
   *
   * NOTE: Upstream servers and tool groups now live in the database
   * (managed via the Admin API / CLI), not in static config files.
   */
  async start(): Promise<void> {
    // Hydrate in-memory state from storage
    await this.toolRegistry.load();
    await this.toolGroups.load();
    await this.promptRegistry.load();
    await this.sessionManager.loadFromStorage(this.storage);
    await this.policyEngine.load();

    // Mount rate-limit middleware on MCP routes only (requires async backend init).
    // Registered BEFORE the HTTP server starts; Hono dispatches middleware by
    // path pattern regardless of route-registration order.
    if (this.config.rateLimit.enabled) {
      this.rateLimiter = await createRateLimiter(this.config.rateLimit);
      const mcpPath = this.config.gateway.mcpPath;
      this.app.use(`${mcpPath}/*`, rateLimitMiddleware({ rateLimiter: this.rateLimiter }));
      this.app.use(`${mcpPath}`, rateLimitMiddleware({ rateLimiter: this.rateLimiter }));
      log.info({ path: mcpPath, backend: this.config.rateLimit.backend }, "Registered: Rate-limit middleware on MCP path");
    }

    // Mount quota middleware on MCP routes only (after rate-limit).
    if (this.config.quota.enabled) {
      this.quotaService = new QuotaService(this.storage, this.config.quota);
      const mcpPath = this.config.gateway.mcpPath;
      this.app.use(`${mcpPath}/*`, quotaMiddleware({ quota: this.quotaService }));
      this.app.use(mcpPath, quotaMiddleware({ quota: this.quotaService }));
      this.quotaSweepInterval = setInterval(async () => {
        try {
          await this.storage.usage.resetBefore(dayScope());
        } catch { /* log later */ }
      }, 60 * 60 * 1000);
      this.quotaSweepInterval.unref?.();
      log.info({ path: mcpPath }, "Registered: Quota middleware on MCP path");
    }

    // Mount cache middleware on MCP routes only (after quota).
    if (this.config.cache.enabled) {
      this.toolCache = await createToolCache(this.config.cache, this.storage);
      const mcpPath = this.config.gateway.mcpPath;
      const apiPath = this.config.gateway.apiPath;
      this.app.use(`${mcpPath}/*`, cacheMiddleware({
        cache: this.toolCache,
        toolRegistry: this.toolRegistry,
        defaultTtlSec: this.config.cache.defaultTtlSec,
      }));
      this.app.use(mcpPath, cacheMiddleware({
        cache: this.toolCache,
        toolRegistry: this.toolRegistry,
        defaultTtlSec: this.config.cache.defaultTtlSec,
      }));
      // Mount the cache admin sub-routes at /api/cache.
      this.app.route(`${apiPath}/cache`, createCacheRoutes({ cache: this.toolCache }));
      log.info({ path: mcpPath, backend: this.config.cache.backend }, "Registered: Cache middleware on MCP path");
    }

    // Mount approval-gate middleware on MCP routes (after cache).
    if (this.config.approval.enabled) {
      this.approvalService = new ApprovalService(this.storage, this.config.approval);
      const mcpPath = this.config.gateway.mcpPath;
      const apiPath = this.config.gateway.apiPath;
      this.app.use(`${mcpPath}/*`, approvalGateMiddleware({
        approvalService: this.approvalService,
        toolRegistry: this.toolRegistry,
      }));
      this.app.use(mcpPath, approvalGateMiddleware({
        approvalService: this.approvalService,
        toolRegistry: this.toolRegistry,
      }));
      this.app.route(`${apiPath}/approvals`, createApprovalsRoutes({ approvalService: this.approvalService }));
      this.approvalSweepInterval = setInterval(async () => {
        try { await this.approvalService!.expireOverdue(); } catch {}
      }, 60_000);
      this.approvalSweepInterval.unref?.();
      log.info({ path: mcpPath }, "Registered: Approval-gate middleware on MCP path");
    }

    // Start webhook dispatcher worker (background HTTP delivery + HMAC + retry).
    if (this.config.webhooks.enabled) {
      this.webhookDispatcher = new WebhookDispatcher(this.storage, this.config.webhooks);
      this.webhookDispatcher.start();
      log.info(
        { pollMs: this.config.webhooks.workerPollIntervalMs, concurrency: this.config.webhooks.workerConcurrency },
        "Registered: Webhook dispatcher worker",
      );
    }

    // Mount rate-limit status admin endpoint at /api/rate-limit.
    this.app.route(`${this.config.gateway.apiPath}/rate-limit`, createRateLimitRoutes({ config: this.config }));

    // Mount quota status admin endpoint at /api/quota (only when quota is enabled).
    if (this.quotaService) {
      this.app.route(`${this.config.gateway.apiPath}/quota`, createQuotaRoutes({ quota: this.quotaService }));
    }

    // Start HTTP server
    const { port, host } = this.config.gateway;

    this.server = serve({
      fetch: this.app.fetch,
      port,
      hostname: host,
    });

    const serverRows = await this.storage.servers.list();
    const serverCount = serverRows.length;
    const toolCount = this.toolRegistry.size;
    const groupCount = this.toolGroups.list().length;

    log.info(
      {
        mode: this.config.mode,
        port,
        host,
        mcpPath: this.config.gateway.mcpPath,
        apiPath: this.config.gateway.apiPath,
        servers: serverCount,
        tools: toolCount,
        groups: groupCount,
        oidc: !!this.config.oidc?.enabled,
        authz: this.config.authorization.enabled,
      },
      `MCP Gateway started [${this.config.mode} mode]`
    );

    log.info(`  MCP endpoint:   http://${host}:${port}${this.config.gateway.mcpPath}`);
    log.info(`  Admin API:      http://${host}:${port}${this.config.gateway.apiPath}`);
    log.info(`  Dashboard:      http://${host}:${port}/dashboard`);
    log.info(`  Auth login:     http://${host}:${port}/auth/login/<provider-id>`);
    log.info(`  Auth providers: http://${host}:${port}/auth/providers`);
    log.info(`  Health check:   http://${host}:${port}${this.config.gateway.apiPath}/health`);

    if (this.config.monitoring.metricsEnabled) {
      log.info(`  Metrics:        http://${host}:${port}${this.config.gateway.apiPath}/metrics`);
    }
  }

  /**
   * Graceful shutdown.
   */
  async stop(): Promise<void> {
    log.info("Shutting down gateway...");

    if (this.server) {
      this.server.close();
    }

    await this.sessionManager.shutdown();

    if (this.rateLimiter) {
      await this.rateLimiter.shutdown();
    }

    if (this.quotaSweepInterval) {
      clearInterval(this.quotaSweepInterval);
    }

    if (this.approvalSweepInterval) {
      clearInterval(this.approvalSweepInterval);
    }

    if (this.webhookDispatcher) {
      this.webhookDispatcher.stop();
    }

    if (this.toolCache?.shutdown) {
      await this.toolCache.shutdown();
    }

    log.info("Gateway shut down complete");
  }

  // ── Accessors (for testing) ────────────────────────

  getApp() { return this.app; }
  getToolRegistry() { return this.toolRegistry; }
  getToolGroups() { return this.toolGroups; }
  getPromptRegistry() { return this.promptRegistry; }
  getSessionManager() { return this.sessionManager; }
  getPolicyEngine() { return this.policyEngine; }
  getAuditLogger() { return this.auditLogger; }
  getStorage() { return this.storage; }
}
