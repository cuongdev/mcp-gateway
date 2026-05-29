// ============================================================
// Audit Middleware
// Logs all MCP requests with user, action, and result details
// ============================================================

import type { MiddlewareHandler } from "hono";
import type { AuditConfig } from "../../config/schema.js";
import type { AuditEntry } from "../../types/gateway.js";
import type { GatewayVariables } from "../types.js";
import type { StorageAdapter } from "../../storage/adapter.js";
import { AuditLogger } from "./audit.logger.js";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../../utils/logger.js";

const log = logger.child({ component: "audit" });

/**
 * Creates audit logging middleware.
 * Captures request details, authorization decisions, and response outcomes.
 */
export function createAuditMiddleware(
  config: AuditConfig,
  storage: StorageAdapter,
): MiddlewareHandler<{ Variables: GatewayVariables }> {
  const auditLogger = new AuditLogger({ storage, config });

  return async (c, next) => {
    const startTime = performance.now();
    const ctx = c.get("gatewayCtx");
    const user = c.get("user");

    let status: "success" | "error" | "timeout" = "success";
    let errorCode: string | undefined;
    let errorMessage: string | undefined;

    try {
      await next();

      // Check response status
      if (c.res.status >= 400) {
        status = "error";
        errorCode = `HTTP_${c.res.status}`;
      }
    } catch (err) {
      status = "error";
      if (err instanceof Error) {
        errorCode = err.name;
        errorMessage = err.message;
      }
      throw err; // Re-throw for error handler
    } finally {
      const responseTimeMs = performance.now() - startTime;

      const entry: AuditEntry = {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        requestId: ctx?.requestId ?? "unknown",
        userId: user?.sub,
        userEmail: user?.email,
        userOrg: user?.orgId,
        action: ctx?.mcpMessage?.method ?? c.req.method,
        method: ctx?.mcpMessage?.method,
        toolName: extractToolName(ctx?.mcpMessage),
        targetServer: ctx?.targetServer,
        authorization: {
          decision: ctx?.authzDecision?.allowed
            ? "ALLOW"
            : ctx?.authzDecision
              ? "DENY"
              : "SKIP",
          matchedPolicy: ctx?.authzDecision?.matchedPolicy,
          evaluationTimeMs: ctx?.authzDecision?.evaluationTimeMs,
          model: ctx?.authzDecision?.model,
        },
        result: {
          status,
          responseTimeMs,
          errorCode,
          errorMessage,
        },
        metadata: {
          ipAddress: ctx?.metadata.ipAddress as string,
          userAgent: ctx?.metadata.userAgent as string,
          // Capture the HTTP method + path + status so plain API/dashboard
          // requests (where there's no MCP method or tool) are distinguishable
          // in the audit log — and so `resource` can fall back to the path.
          httpMethod: c.req.method,
          path: c.req.path,
          httpStatus: c.res?.status,
        },
      };

      // Write audit log (non-blocking)
      auditLogger.log(entry).catch((err) => {
        log.error({ err }, "Failed to write audit log");
      });
    }
  };
}

/**
 * Extract tool name from MCP message params.
 */
function extractToolName(
  message?: { method: string; params?: Record<string, unknown> }
): string | undefined {
  if (!message) return undefined;
  if (message.method === "tools/call") {
    return message.params?.name as string | undefined;
  }
  return undefined;
}
