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
import { ResourceRegistry } from "./registry/resource.registry.js";
import { RootRegistry } from "./registry/root.registry.js";
import { CapabilityRegistry } from "./capability/registry.js";
import { InMemoryStateMachine, type StateMachine, type TransitionEvent } from "./health/state-machine.js";
import { ProbeLoop } from "./health/probe-loop.js";
import { createCircuitsRoutes } from "./routes/admin/circuits.routes.js";
import {
  circuitStateGauge,
  circuitTripsTotal,
} from "./middleware/monitoring/metrics.middleware.js";
import { ConnectorRegistry } from "./catalog/connectors.js";
import { CatalogInstaller } from "./catalog/installer.js";
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
import { createWebhooksRoutes } from "./routes/admin/webhooks.routes.js";
import { WebhookDispatcher } from "./notify/webhook.dispatcher.js";
import type { ToolCache } from "./cache/interface.js";
import { logger } from "./utils/logger.js";
import { createTenantsRoutes } from "./routes/admin/tenants.routes.js";
import { createProxiesRoutes } from "./routes/admin/proxies.routes.js";
import { ProxyRegistry } from "./proxy/registry.js";
import { bootstrapFromConfig } from "./storage/bootstrap.js";
import { RedactionEngineFactory } from "./redaction/factory.js";
import { seedAllTenants } from "./redaction/seed.js";

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
  private resourceRegistry: ResourceRegistry;
  private rootRegistry: RootRegistry;
  private capabilityRegistry: CapabilityRegistry;
  private stateMachine: StateMachine;
  private connectorRegistry: ConnectorRegistry;
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
  private proxyRegistry?: ProxyRegistry;
  private redactionFactory?: RedactionEngineFactory;
  private catalogInstaller?: CatalogInstaller;
  private probeLoop?: ProbeLoop;
  private transitionUnsubscribe?: () => void;

  constructor(config: GatewayConfig, storage: StorageAdapter) {
    this.config = config;
    this.storage = storage;
    this.app = new Hono<{ Variables: GatewayVariables }>();

    // Initialize core services backed by storage
    this.toolRegistry = new ToolRegistry(storage);
    this.toolGroups = new ToolGroupManager(storage, this.toolRegistry);
    this.promptRegistry = new PromptRegistry(storage);
    this.resourceRegistry = new ResourceRegistry(storage);
    this.rootRegistry = new RootRegistry(storage);
    this.capabilityRegistry = new CapabilityRegistry(
      this.toolRegistry, this.promptRegistry, this.resourceRegistry, this.rootRegistry,
    );
    this.stateMachine = new InMemoryStateMachine();
    this.connectorRegistry = new ConnectorRegistry();
    this.sessionManager = new SessionManager();
    // Wire state machine into session manager so send() consults the
    // circuit breaker and records the outcome (P6).
    this.sessionManager.setStateMachine(this.stateMachine);
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
    buildMiddlewarePipeline(this.app, this.config, {
      storage: this.storage,
      policyEngine: this.policyEngine,
    });
  }

  private setupRoutes() {
    const { mcpPath, apiPath } = this.config.gateway;

    // Redaction factory wired up-front so both MCP and admin routes can use it.
    this.redactionFactory = new RedactionEngineFactory(this.storage);

    // ── MCP Routes (for AI agents / MCP clients) ─────
    const mcpRoutes = createMCPRoutes({
      toolRegistry: this.toolRegistry,
      toolGroups: this.toolGroups,
      sessionManager: this.sessionManager,
      promptRegistry: this.promptRegistry,
      resourceRegistry: this.resourceRegistry,
      redactionFactory: this.redactionFactory,
      storage: this.storage,
    });
    this.app.route(mcpPath, mcpRoutes);

    log.info({ path: mcpPath }, "MCP Gateway endpoint mounted");
    log.info({ path: `${mcpPath}/groups/:name` }, "MCP Group endpoints mounted");

    // ── Auth Routes (OIDC login/callback/logout) ─────
    const authRoutes = createAuthRoutes(this.config, {
      storage: this.storage,
      policyEngine: this.policyEngine,
    });
    this.app.route("/auth", authRoutes);
    log.info({ providers: this.config.oidcProviders.map((p) => p.id) }, "Auth routes mounted at /auth");

    // ── Admin REST API (for developers) ──────────────
    // Cache-dependent admin routes are mounted in start() after async cache init.
    // Wire catalog installer before admin routes so /api/catalog can mount.
    // Note: the registry is hydrated in start() via loadBuiltin(); the
    // installer references the same instance and sees rows lazily.
    this.catalogInstaller = new CatalogInstaller(
      this.connectorRegistry,
      this.storage,
      this.sessionManager,
      this.toolRegistry,
      // webhookDispatcher is initialized later in start() — pass undefined here.
      // Re-wiring is not required since emit() reads from the dispatcher via
      // closure at call-time and the installer is reconstructed if needed.
      undefined,
    );

    const adminRoutes = createAdminRoutes({
      config: this.config,
      storage: this.storage,
      toolRegistry: this.toolRegistry,
      toolGroups: this.toolGroups,
      sessionManager: this.sessionManager,
      promptRegistry: this.promptRegistry,
      policyEngine: this.policyEngine,
      // Late-bound: proxyRegistry is initialized in start(), well after
      // admin routes are mounted in the constructor.
      proxyRegistry: () => this.proxyRegistry,
      redactionFactory: this.redactionFactory,
      connectorRegistry: this.connectorRegistry,
      catalogInstaller: this.catalogInstaller,
    });
    this.app.route(apiPath, adminRoutes);

    log.info({ path: apiPath }, "Admin API mounted");

    // ── Dashboard (admin web UI) ────────────────────
    this.setupDashboard();
  }

  /**
   * Serve the admin dashboard SPA bundle.
   *
   *   GET /dashboard           → static index.html
   *   GET /dashboard/assets/*  → static asset
   *   GET /dashboard/<route>   → falls back to index.html so React Router
   *                              handles client-side routing
   *   GET /                    → redirects to /dashboard
   *
   * Resolves the bundle directory by trying known locations in order:
   *   1. <__dirname>/dashboard            — tsc build (__dirname = dist/)
   *   2. <__dirname>/../dist/dashboard    — tsx run (__dirname = src/)
   *   3. <__dirname>/../../web/dist       — local dev convenience
   * The first directory containing `index.html` wins.
   */
  private setupDashboard() {
    const candidates = [
      resolve(__dirname, "dashboard"),
      resolve(__dirname, "..", "dist", "dashboard"),
      resolve(__dirname, "..", "..", "web", "dist"),
    ];
    let dashboardDir: string | null = null;
    let indexHtml: string | null = null;
    for (const dir of candidates) {
      try {
        indexHtml = readFileSync(resolve(dir, "index.html"), "utf-8");
        dashboardDir = dir;
        break;
      } catch { /* try next */ }
    }
    if (!dashboardDir || !indexHtml) {
      log.warn({ tried: candidates }, "Dashboard bundle not found — run `npm run build:web`");
      return;
    }

    // Serve static assets (JS, CSS, images, etc) from /dashboard/<path>.
    // Hono doesn't ship a node-fs static helper out of the box on
    // @hono/node-server, so we do it manually for the assets/* tree which
    // is the only thing Vite emits.
    this.app.get("/dashboard/assets/*", async (c) => {
      const rel = c.req.path.replace(/^\/dashboard\//, "");
      const filePath = resolve(dashboardDir, rel);
      try {
        const data = readFileSync(filePath);
        const ext = filePath.split('.').pop() ?? '';
        const mime: Record<string, string> = {
          js: 'application/javascript', css: 'text/css',
          map: 'application/json', svg: 'image/svg+xml',
          png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
          ico: 'image/x-icon', woff2: 'font/woff2',
        };
        c.header('Content-Type', mime[ext] ?? 'application/octet-stream');
        c.header('Cache-Control', 'public, max-age=31536000, immutable');
        return c.body(data as unknown as ArrayBuffer);
      } catch {
        return c.notFound();
      }
    });

    // SPA fallback: any other /dashboard or /dashboard/* path returns index.html.
    this.app.get("/dashboard", (c) => c.html(indexHtml!));
    this.app.get("/dashboard/*", (c) => c.html(indexHtml!));

    // Redirect root to dashboard.
    this.app.get("/", (c) => c.redirect("/dashboard"));

    log.info({ path: "/dashboard", bundleDir: dashboardDir }, "Admin Dashboard mounted");
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
    await this.resourceRegistry.load();
    await this.rootRegistry.load();
    this.connectorRegistry.loadBuiltin();
    await this.sessionManager.loadFromStorage(this.storage);
    await this.policyEngine.load();

    // Bootstrap config-declared servers + groups into storage
    // (idempotent, additive). Runtime-registered entries absent from
    // config are preserved. OpenAPI transports are skipped — register
    // them at runtime via the admin API/CLI.
    const bootstrapLog = {
      info: (msg: string, extra?: Record<string, unknown>) => log.info(extra ?? {}, msg),
      warn: (msg: string, extra?: Record<string, unknown>) => log.warn(extra ?? {}, msg),
    };
    const bootstrap = await bootstrapFromConfig(this.storage, this.config, bootstrapLog);
    if (bootstrap.serversApplied > 0 || bootstrap.groupsApplied > 0) {
      // Re-hydrate registries so they see the freshly-upserted rows.
      await this.toolRegistry.load();
      await this.toolGroups.load();
    }

    // Seed built-in redaction rules per tenant (idempotent — no-op if seeded).
    await seedAllTenants(this.storage);

    // Proxy registry — hydrate before admin routes so /api/proxies sees a ready instance.
    this.proxyRegistry = new ProxyRegistry(this.storage);
    await this.proxyRegistry.load();
    // Wire outbound dispatcher into SessionManager (P5).
    this.sessionManager.setStorage(this.storage);
    this.sessionManager.setProxyContext(
      this.proxyRegistry,
      this.config.proxy.defaultName ?? null,
    );
    this.app.route(`${this.config.gateway.apiPath}/proxies`, createProxiesRoutes({
      storage: this.storage,
      proxyRegistry: this.proxyRegistry,
    }));
    log.info({ path: `${this.config.gateway.apiPath}/proxies` }, "Registered: Proxy admin routes");

    // System tenant admin routes — available regardless of tenancy.enabled.
    this.app.route(`${this.config.gateway.apiPath}/system/tenants`, createTenantsRoutes({ storage: this.storage }));
    log.info({ path: `${this.config.gateway.apiPath}/system/tenants` }, "Registered: System tenant routes");

    // ── P6 Circuit Breaker ──────────────────────────────
    // Hydrate the in-memory state machine from persisted server_state rows
    // BEFORE attaching the listener — restore() does not fire transitions
    // (we don't want every boot to re-emit the original trip events).
    try {
      const persisted = await this.storage.serverStates.list();
      for (const row of persisted) {
        this.stateMachine.restore(row.serverName, {
          state: row.state,
          rolling: row.rollingWindow,
          consecutiveErrors: row.consecutiveErrors,
          openedAt: row.openedAt ?? undefined,
          halfOpenTestAt: row.halfOpenTestAt ?? undefined,
          reopenCount: row.reopenCount,
          lastTransitionReason: row.lastTransitionReason ?? undefined,
          lastTransitionAt: row.updatedAt,
          config: (row.config as Record<string, never> | null) ?? undefined,
        });
      }
      if (persisted.length > 0) {
        log.info({ count: persisted.length }, "Restored server_state from storage");
      }
    } catch (err) {
      log.warn({ err }, "Failed to restore server_state on boot (continuing with empty state)");
    }

    // Attach transition listener — persists every state change + updates
    // Prometheus metrics + emits server.state.changed webhook event.
    this.transitionUnsubscribe = this.stateMachine.onTransition((event: TransitionEvent) => {
      // Persist (fire-and-forget; we don't want listener latency to
      // affect the in-memory state machine).
      void (async () => {
        try {
          const h = this.stateMachine.getState(event.serverName);
          await this.storage.serverStates.upsert({
            serverName: event.serverName,
            state: event.to,
            consecutiveErrors: h.consecutiveErrors,
            rollingWindow: h.rolling,
            openedAt: h.openedAt ?? null,
            halfOpenTestAt: h.halfOpenTestAt ?? null,
            reopenCount: h.reopenCount,
            config: h.config as unknown as Record<string, unknown>,
            lastTransitionReason: event.reason,
          });
        } catch (err) {
          log.warn({ err, server: event.serverName }, "Failed to persist server_state transition");
        }
      })();

      // Update Prometheus gauges: set 1 for the new state, 0 for all
      // others on the same server. (We can't enumerate all server-state
      // pairs ahead of time so we zero the OLD state when applicable.)
      try {
        const states: ReadonlyArray<TransitionEvent["to"]> = [
          "healthy", "degraded", "circuit_open", "half_open", "quarantined", "manual_disabled",
        ];
        for (const s of states) {
          circuitStateGauge.set({ server: event.serverName, state: s }, s === event.to ? 1 : 0);
        }
        if (event.to === "circuit_open" || event.to === "quarantined" || event.to === "manual_disabled") {
          circuitTripsTotal.inc({ server: event.serverName, reason: event.reason });
        }
      } catch { /* metrics never throw into the listener */ }

      // Webhook event — fire-and-forget.
      if (this.webhookDispatcher) {
        void this.webhookDispatcher
          .emit("server.state.changed", {
            server: event.serverName,
            from: event.from,
            to: event.to,
            reason: event.reason,
            ts: event.ts,
          })
          .catch(() => {});
      }
    });

    // Mount /api/circuits admin routes.
    this.app.route(`${this.config.gateway.apiPath}/circuits`, createCircuitsRoutes({
      stateMachine: this.stateMachine,
      storage: this.storage,
    }));
    log.info({ path: `${this.config.gateway.apiPath}/circuits` }, "Registered: Circuit-breaker admin routes");

    // Start the background probe loop. SessionManager satisfies ProbeTarget
    // via rawSend(). The probe path does NOT consult the circuit guard.
    this.probeLoop = new ProbeLoop(this.stateMachine, this.sessionManager);
    this.probeLoop.start();
    log.info("Registered: Circuit-breaker probe loop");

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
        webhookDispatcher: this.webhookDispatcher,
      }));
      this.app.use(mcpPath, approvalGateMiddleware({
        approvalService: this.approvalService,
        toolRegistry: this.toolRegistry,
        webhookDispatcher: this.webhookDispatcher,
      }));
      this.app.route(`${apiPath}/approvals`, createApprovalsRoutes({
        approvalService: this.approvalService,
        webhookDispatcher: this.webhookDispatcher,
      }));
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
      // Mount webhook admin routes.
      this.app.route(`${this.config.gateway.apiPath}/webhooks`, createWebhooksRoutes({ storage: this.storage }));
      log.info({ path: `${this.config.gateway.apiPath}/webhooks` }, "Registered: Webhook admin routes");
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

    if (this.proxyRegistry) {
      await this.proxyRegistry.shutdown();
    }

    if (this.probeLoop) {
      this.probeLoop.stop();
    }
    if (this.transitionUnsubscribe) {
      this.transitionUnsubscribe();
      this.transitionUnsubscribe = undefined;
    }

    log.info("Gateway shut down complete");
  }

  // ── Accessors (for testing) ────────────────────────

  getApp() { return this.app; }
  getToolRegistry() { return this.toolRegistry; }
  getToolGroups() { return this.toolGroups; }
  getPromptRegistry() { return this.promptRegistry; }
  getResourceRegistry() { return this.resourceRegistry; }
  getRootRegistry() { return this.rootRegistry; }
  getCapabilityRegistry() { return this.capabilityRegistry; }
  getStateMachine() { return this.stateMachine; }
  getConnectorRegistry() { return this.connectorRegistry; }
  getSessionManager() { return this.sessionManager; }
  getPolicyEngine() { return this.policyEngine; }
  getAuditLogger() { return this.auditLogger; }
  getStorage() { return this.storage; }
  getRedactionFactory() { return this.redactionFactory; }
}
