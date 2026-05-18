// ============================================================
// Middleware Types
// ============================================================

import type { Context } from "hono";
import type { GatewayContext, UserContext } from "../types/gateway.js";
import type { Principal, AuthMethod } from "../identity/principal.js";

/** Extended Hono context with gateway-specific data */
export interface GatewayHonoContext extends Context {
  // Gateway context is stored in c.set/c.get
}

/** Variables stored in Hono context */
export type GatewayVariables = {
  gatewayCtx: GatewayContext;
  user: UserContext;
  principal: Principal;
  authMethod: AuthMethod;
};

/** Middleware metadata for registration and ordering */
export interface MiddlewareDefinition {
  /** Unique name for this middleware */
  name: string;
  /** Execution priority (lower = earlier). Default middleware priorities:
   *  10 - Error boundary
   *  20 - Request logging
   *  30 - Authentication
   *  40 - Authorization
   *  50 - Audit
   *  60 - Monitoring
   *  70 - Proxy
   */
  priority: number;
  /** Whether this middleware is enabled */
  enabled: boolean;
  /** Description for debugging/monitoring */
  description?: string;
}

/** Result of a middleware operation for audit purposes */
export interface MiddlewareResult {
  middlewareName: string;
  durationMs: number;
  outcome: "pass" | "reject" | "error";
  details?: Record<string, unknown>;
}
