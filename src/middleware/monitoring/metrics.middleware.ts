// ============================================================
// Metrics Middleware
// Prometheus-compatible metrics collection
// ============================================================

import {
  Counter,
  Histogram,
  Gauge,
  Registry,
  collectDefaultMetrics,
} from "prom-client";
import type { MiddlewareHandler } from "hono";
import type { GatewayVariables } from "../types.js";
import { logger } from "../../utils/logger.js";

const log = logger.child({ component: "metrics" });

// ── Global metrics registry ──────────────────────────────

export const metricsRegistry = new Registry();

// Collect default Node.js metrics (CPU, memory, event loop, etc.)
collectDefaultMetrics({ register: metricsRegistry });

// ── Custom metrics ───────────────────────────────────────

export const httpRequestsTotal = new Counter({
  name: "mcp_gateway_http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "path", "status"] as const,
  registers: [metricsRegistry],
});

export const httpRequestDuration = new Histogram({
  name: "mcp_gateway_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "path", "status"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export const mcpToolExecutions = new Counter({
  name: "mcp_gateway_tool_executions_total",
  help: "Total number of MCP tool executions",
  labelNames: ["tool_name", "server", "status"] as const,
  registers: [metricsRegistry],
});

export const authorizationDecisions = new Counter({
  name: "mcp_gateway_authorization_decisions_total",
  help: "Total number of authorization decisions",
  labelNames: ["decision", "model"] as const,
  registers: [metricsRegistry],
});

export const authenticationFailures = new Counter({
  name: "mcp_gateway_authentication_failures_total",
  help: "Total number of authentication failures",
  labelNames: ["reason"] as const,
  registers: [metricsRegistry],
});

export const upstreamErrors = new Counter({
  name: "mcp_gateway_upstream_errors_total",
  help: "Total number of upstream server errors",
  labelNames: ["server", "error_type"] as const,
  registers: [metricsRegistry],
});

export const activeConnections = new Gauge({
  name: "mcp_gateway_active_connections",
  help: "Number of active connections",
  registers: [metricsRegistry],
});

export const rateLimitHits = new Counter({
  name: "mcp_rate_limit_hits_total",
  help: "Number of requests denied by rate limiter",
  labelNames: ["principal_type", "rule"] as const,
  registers: [metricsRegistry],
});

export const quotaExceeded = new Counter({
  name: "mcp_quota_exceeded_total",
  help: "Number of quota-denied requests",
  labelNames: ["principal_type", "period"] as const,
  registers: [metricsRegistry],
});

export const cacheHits = new Counter({
  name: "mcp_cache_hits_total",
  help: "Tool-call cache hits",
  labelNames: ["tool"] as const,
  registers: [metricsRegistry],
});

export const cacheMisses = new Counter({
  name: "mcp_cache_misses_total",
  help: "Tool-call cache misses (cacheable tool)",
  labelNames: ["tool"] as const,
  registers: [metricsRegistry],
});

export const upstreamLatency = new Histogram({
  name: "mcp_gateway_upstream_latency_seconds",
  help: "Upstream server response latency in seconds",
  labelNames: ["server", "transport"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export const proxyRequestsTotal = new Counter({
  name: "mcp_proxy_requests_total",
  help: "Outbound requests routed through a named proxy",
  labelNames: ["proxy", "result"] as const,
  registers: [metricsRegistry],
});

export const toolCallDuration = new Histogram({
  name: "mcp_tool_call_duration_seconds",
  help: "End-to-end tool call latency (gateway-observed)",
  labelNames: ["tool", "result"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

/**
 * Creates metrics collection middleware.
 * Tracks request count, duration, and status.
 */
export function createMetricsMiddleware(): MiddlewareHandler<{
  Variables: GatewayVariables;
}> {
  return async (c, next) => {
    const start = performance.now();
    activeConnections.inc();

    try {
      await next();
    } finally {
      const duration = (performance.now() - start) / 1000;
      const status = String(c.res.status);
      const method = c.req.method;
      const path = new URL(c.req.url).pathname;

      httpRequestsTotal.inc({ method, path, status });
      httpRequestDuration.observe({ method, path, status }, duration);
      activeConnections.dec();

      // Track tool executions from gateway context
      const ctx = c.get("gatewayCtx");
      if (ctx?.mcpMessage?.method === "tools/call") {
        const toolName = (ctx.mcpMessage.params?.name as string) ?? "unknown";
        const toolStatus = c.res.status < 400 ? "success" : "error";
        mcpToolExecutions.inc({
          tool_name: toolName,
          server: ctx.targetServer ?? "unknown",
          status: toolStatus,
        });
      }

      // Track authorization decisions
      if (ctx?.authzDecision) {
        authorizationDecisions.inc({
          decision: ctx.authzDecision.allowed ? "allow" : "deny",
          model: ctx.authzDecision.model ?? "unknown",
        });
      }
    }
  };
}

/**
 * Get metrics in Prometheus text format.
 */
export async function getMetrics(): Promise<string> {
  return metricsRegistry.metrics();
}
