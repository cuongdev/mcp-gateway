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
import { logger } from "../utils/logger.js";

// Middleware factories
import { createAuthMiddleware } from "./auth/oidc.middleware.js";
import { createAuthzMiddleware } from "./authz/policy.engine.js";
import { createAuditMiddleware } from "./audit/audit.middleware.js";
import { createMetricsMiddleware } from "./monitoring/metrics.middleware.js";

/**
 * Build the complete middleware pipeline for the gateway.
 */
export function buildMiddlewarePipeline(
  app: Hono<{ Variables: GatewayVariables }>,
  config: GatewayConfig
) {
  const log = logger.child({ component: "middleware-pipeline" });
  const { mcpPath, apiPath } = config.gateway;

  // ── 1. CORS (all routes) ───────────────────────────
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
  if (config.monitoring.metricsEnabled) {
    const metricsMiddleware = createMetricsMiddleware();
    app.use("*", metricsMiddleware);
    log.info("Registered: Metrics middleware");
  }

  // ── 4. Authentication — MCP routes ─────────────────
  const hasOIDC = config.oidcProviders.length > 0;
  if (hasOIDC) {
    const authMiddleware = createAuthMiddleware(config);

    // Protect MCP endpoints
    app.use(`${mcpPath}/*`, authMiddleware);
    app.use(`${mcpPath}`, authMiddleware);

    // In enterprise mode, also protect admin API
    if (config.mode === "enterprise") {
      app.use(`${apiPath}/*`, authMiddleware);
      log.info("Enterprise mode: Admin API requires authentication");
    }

    log.info({ providers: config.oidcProviders.map((p) => p.id) }, "Registered: OIDC authentication middleware");
  } else {
    if (config.mode === "enterprise") {
      log.warn("Enterprise mode: No OIDC providers — endpoints unprotected until providers configured");
    } else {
      log.info("Development mode: Authentication disabled");
    }
  }

  // ── 5. Authorization — MCP routes ──────────────────
  if (config.authorization.enabled) {
    const authzMiddleware = createAuthzMiddleware(config.authorization);

    app.use(`${mcpPath}/*`, authzMiddleware);
    app.use(`${mcpPath}`, authzMiddleware);

    log.info("Registered: Authorization middleware (Casbin)");
  } else {
    log.info("Authorization disabled");
  }

  // ── 6. Audit — MCP routes ─────────────────────────
  if (config.audit.enabled) {
    const auditMiddleware = createAuditMiddleware(config.audit);

    app.use(`${mcpPath}/*`, auditMiddleware);
    app.use(`${mcpPath}`, auditMiddleware);

    log.info("Registered: Audit middleware");
  }

  log.info(
    { mode: config.mode, mcpPath, apiPath },
    "Middleware pipeline built"
  );
}
