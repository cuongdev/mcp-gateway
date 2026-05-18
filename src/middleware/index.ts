// ============================================================
// Middleware Pipeline Orchestrator
// Registers and executes middleware in priority order.
//
// Middleware is applied differently for MCP vs Admin routes:
//   /mcp/*  — OIDC auth + Casbin authz + audit
//   /api/*  — optional auth (enterprise mode only)
// ============================================================

import { Hono } from "hono";
import { cors } from "hono/cors";
import { v4 as uuidv4 } from "uuid";
import type { GatewayConfig } from "../config/schema.js";
import type { GatewayContext } from "../types/gateway.js";
import type { GatewayVariables } from "./types.js";
import type { StorageAdapter } from "../storage/adapter.js";
import { logger } from "../utils/logger.js";
import { anonymousDev } from "../identity/principal.js";
import { bearerTokenMiddleware } from "./auth/bearer-token.middleware.js";
import { sessionCookieMiddleware } from "./auth/session-cookie.middleware.js";

// Middleware factories
import { createAuthzMiddleware } from "./authz/policy.engine.js";
import { createAuditMiddleware } from "./audit/audit.middleware.js";
import { createMetricsMiddleware } from "./monitoring/metrics.middleware.js";

export interface PipelineDeps {
  storage: StorageAdapter;
}

/**
 * Build the complete middleware pipeline for the gateway.
 */
export function buildMiddlewarePipeline(
  app: Hono<{ Variables: GatewayVariables }>,
  config: GatewayConfig,
  deps: PipelineDeps,
) {
  const log = logger.child({ component: "middleware-pipeline" });
  const mcpPath = config.gateway?.mcpPath ?? "/mcp";
  const apiPath = config.gateway?.apiPath ?? "/api";

  // ── 1. CORS (all routes) ───────────────────────────
  if (config.gateway?.corsOrigins) {
    app.use(
      "*",
      cors({
        origin: config.gateway.corsOrigins,
        allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization", "Mcp-Session-Id"],
        exposeHeaders: ["Mcp-Session-Id"],
      })
    );
    log.info("Registered: CORS middleware");
  }

  // ── 2. Request Context (all routes) ────────────────
  app.use("*", async (c, next) => {
    const ctx: GatewayContext = {
      requestId: uuidv4(),
      timestamp: new Date(),
      metadata: {
        ipAddress:
          c.req.header("x-forwarded-for") ??
          c.req.header("x-real-ip") ??
          "unknown",
        userAgent: c.req.header("user-agent") ?? "unknown",
      },
    };
    c.set("gatewayCtx", ctx);
    c.header("X-Request-Id", ctx.requestId);
    await next();
  });
  log.info("Registered: Request context middleware");

  // ── 3. Metrics (all routes) ────────────────────────
  if (config.monitoring?.metricsEnabled) {
    const metricsMiddleware = createMetricsMiddleware();
    app.use("*", metricsMiddleware);
    log.info("Registered: Metrics middleware");
  }

  // ── 4a. Dev mode: inject anonymous principal so downstream routes
  //       always have c.var.principal regardless of auth config.
  if (config.mode === "development") {
    app.use("*", async (c, next) => {
      if (!c.get("principal")) c.set("principal", anonymousDev());
      c.set("authMethod", "none");
      await next();
    });
    log.info("Development mode: anonymous principal injected");
  }

  // ── 4b. Session cookie authentication ───────────────
  // Mounted BEFORE bearer-token so OIDC-issued cookies authenticate the
  // request first; bearer-token MW remains as the fallback path. The cookie
  // MW passes through silently on absent/invalid cookies — it never 401s.
  if (config.auth?.sessionCookieSecret) {
    const sessionSecret = new TextEncoder().encode(config.auth.sessionCookieSecret);
    const cookieName = config.auth.sessionCookieName ?? "mcp_session";
    const cookieMw = sessionCookieMiddleware({
      storage: deps.storage,
      secret: sessionSecret,
      cookieName,
    });
    if (config.auth?.requireAuthForApi) {
      app.use(`${apiPath}/*`, cookieMw);
    }
    if (config.auth?.requireAuthForMcp) {
      app.use(`${mcpPath}/*`, cookieMw);
      app.use(`${mcpPath}`, cookieMw);
    }
    log.info({ cookieName }, "Registered: Session-cookie middleware (before bearer-token)");
  }

  // ── 4c. Bearer token authentication ─────────────────
  // Wired before OIDC so service-account tokens are honored on protected paths.
  if (config.auth?.requireAuthForApi) {
    app.use(`${apiPath}/*`, bearerTokenMiddleware({ storage: deps.storage }));
    log.info("Registered: Bearer-token middleware on API path");
  }
  if (config.auth?.requireAuthForMcp) {
    app.use(`${mcpPath}/*`, bearerTokenMiddleware({ storage: deps.storage }));
    app.use(`${mcpPath}`, bearerTokenMiddleware({ storage: deps.storage }));
    log.info("Registered: Bearer-token middleware on MCP path");
  }

  // ── 5. Legacy UserContext shim ──────────────────────
  // P2: the legacy `createAuthMiddleware` was retired. Downstream layers
  // (authz/policy.engine, audit, mcp.routes) still read `c.var.user` as
  // a `UserContext { sub, roles, email, … }`. We synthesize one from
  // `c.var.principal` so those code paths keep functioning without a
  // wholesale rewrite. Roles are currently empty — surfacing roles on
  // the Principal model is tracked separately (see DONE_WITH_CONCERNS
  // note on the P2 unification task).
  app.use("*", async (c, next) => {
    const p = c.get("principal");
    if (p && !c.get("user")) {
      c.set("user", {
        sub: p.id,
        email: p.email,
        name: p.displayName,
        roles: [],
        claims: {},
        issuer: c.get("authMethod") ?? "unknown",
        expiresAt: 0,
      });
      const ctx = c.get("gatewayCtx");
      if (ctx) ctx.user = c.get("user");
    }
    await next();
  });

  const hasOIDC = (config.oidcProviders?.length ?? 0) > 0;
  if (hasOIDC) {
    log.info(
      { providers: config.oidcProviders.map((p) => p.id) },
      "OIDC providers registered — auth via session-cookie + bearer-token pipeline",
    );
  } else if (config.mode === "enterprise") {
    log.warn("Enterprise mode: No OIDC providers — bearer-token auth only");
  } else {
    log.info("Development mode: OIDC authentication disabled");
  }

  // ── 6. Authorization — MCP routes ──────────────────
  if (config.authorization?.enabled) {
    const authzMiddleware = createAuthzMiddleware(config.authorization);

    app.use(`${mcpPath}/*`, authzMiddleware);
    app.use(`${mcpPath}`, authzMiddleware);

    log.info("Registered: Authorization middleware (Casbin)");
  } else {
    log.info("Authorization disabled");
  }

  // ── 7. Audit — MCP routes ─────────────────────────
  if (config.audit?.enabled) {
    const auditMiddleware = createAuditMiddleware(config.audit, deps.storage);

    app.use(`${mcpPath}/*`, auditMiddleware);
    app.use(`${mcpPath}`, auditMiddleware);

    log.info("Registered: Audit middleware");
  }

  log.info(
    { mode: config.mode, mcpPath, apiPath },
    "Middleware pipeline built"
  );
}
