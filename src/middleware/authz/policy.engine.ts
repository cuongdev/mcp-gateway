// ============================================================
// Authorization Middleware - Casbin Policy Engine
// Supports RBAC, ABAC, and ReBAC models
// ============================================================

import { newEnforcer, type Enforcer } from "casbin";
import type { MiddlewareHandler } from "hono";
import type { AuthorizationConfig } from "../../config/schema.js";
import type { GatewayVariables } from "../types.js";
import type { AuthzDecision } from "../../types/gateway.js";
import { AuthorizationError, ToolAccessDeniedError } from "../../types/errors.js";
import { MCP_METHODS } from "../../types/mcp.js";
import { logger } from "../../utils/logger.js";

const log = logger.child({ component: "authz" });

/** Cached policy decisions */
const decisionCache = new Map<
  string,
  { allowed: boolean; expiresAt: number }
>();

let enforcer: Enforcer | null = null;

/**
 * Initialize the Casbin enforcer.
 * Called once at startup.
 */
export async function initializeEnforcer(
  config: AuthorizationConfig
): Promise<Enforcer> {
  if (enforcer) return enforcer;

  log.info(
    { model: config.modelFile, policy: config.policyFile },
    "Initializing Casbin enforcer"
  );

  enforcer = await newEnforcer(config.modelFile, config.policyFile);
  log.info("Casbin enforcer initialized");
  return enforcer;
}

/**
 * Get the current enforcer instance.
 */
export function getEnforcer(): Enforcer | null {
  return enforcer;
}

/**
 * Reload policies from file (hot-reload).
 */
export async function reloadPolicies(): Promise<void> {
  if (!enforcer) throw new Error("Enforcer not initialized");
  await enforcer.loadPolicy();
  decisionCache.clear();
  log.info("Policies reloaded");
}

/**
 * Creates the authorization middleware.
 *
 * For each MCP request, it:
 * 1. Extracts user identity and roles
 * 2. Determines the action (tool name, resource, etc.)
 * 3. Evaluates Casbin policy
 * 4. Allows or denies the request
 */
export function createAuthzMiddleware(
  config: AuthorizationConfig
): MiddlewareHandler<{ Variables: GatewayVariables }> {
  // Initialize enforcer on first request (lazy)
  let initPromise: Promise<Enforcer> | null = null;

  return async (c, next) => {
    // Lazy initialization
    if (!enforcer) {
      if (!initPromise) {
        initPromise = initializeEnforcer(config);
      }
      await initPromise;
    }

    const user = c.get("user");
    const ctx = c.get("gatewayCtx");

    if (!user) {
      // No user context = no auth happened, skip or deny
      if (config.defaultDecision === "allow") {
        await next();
        return;
      }
      throw new AuthorizationError("No user context available for authorization");
    }

    // Parse the MCP message to determine what's being accessed
    const body = ctx?.mcpMessage;
    if (!body) {
      // Not an MCP request (maybe health check), pass through
      await next();
      return;
    }

    const startTime = performance.now();
    let decision: AuthzDecision;

    try {
      decision = await evaluatePolicy(user.sub, user.roles, body.method, body.params, config);
    } catch (err) {
      log.error({ err, user: user.sub }, "Policy evaluation failed");
      decision = {
        allowed: config.defaultDecision === "allow",
        evaluationTimeMs: performance.now() - startTime,
        reason: "Policy evaluation error",
        model: "rbac",
      };
    }

    decision.evaluationTimeMs = performance.now() - startTime;

    // Store decision in context for audit
    if (ctx) ctx.authzDecision = decision;

    if (!decision.allowed) {
      const toolName =
        body.method === MCP_METHODS.TOOLS_CALL
          ? (body.params?.name as string) ?? "unknown"
          : body.method;

      log.warn(
        {
          user: user.sub,
          action: body.method,
          tool: toolName,
          reason: decision.reason,
        },
        "Access denied"
      );

      throw new ToolAccessDeniedError(user.sub, toolName);
    }

    log.debug(
      {
        user: user.sub,
        action: body.method,
        evaluationMs: decision.evaluationTimeMs.toFixed(2),
      },
      "Access granted"
    );

    await next();
  };
}

/**
 * Evaluate a policy decision using Casbin.
 *
 * Supports multiple evaluation strategies:
 * - RBAC: (user_role, resource, action)
 * - ABAC: (user_attributes, resource_attributes, action)
 * - ReBAC: (user, relationship, resource)
 */
async function evaluatePolicy(
  userId: string,
  roles: string[],
  method: string,
  params: Record<string, unknown> | undefined,
  config: AuthorizationConfig
): Promise<AuthzDecision> {
  if (!enforcer) {
    return {
      allowed: config.defaultDecision === "allow",
      reason: "Enforcer not initialized",
      evaluationTimeMs: 0,
      model: "rbac",
    };
  }

  // Determine the resource/object being accessed
  const resource = extractResource(method, params);
  const action = extractAction(method);

  // Check cache
  const cacheKey = `${userId}:${resource}:${action}`;
  if (config.cache.enabled) {
    const cached = decisionCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        allowed: cached.allowed,
        reason: "cached",
        evaluationTimeMs: 0,
        model: "rbac",
      };
    }
  }

  // Evaluate for each role the user has
  let allowed = false;
  let matchedPolicy: string | undefined;

  for (const role of roles) {
    const result = await enforcer.enforce(role, resource, action);
    if (result) {
      allowed = true;
      matchedPolicy = `${role}, ${resource}, ${action}`;
      break;
    }
  }

  // Also check by user ID directly
  if (!allowed) {
    const result = await enforcer.enforce(userId, resource, action);
    if (result) {
      allowed = true;
      matchedPolicy = `${userId}, ${resource}, ${action}`;
    }
  }

  // Cache the decision
  if (config.cache.enabled) {
    decisionCache.set(cacheKey, {
      allowed,
      expiresAt: Date.now() + config.cache.ttl * 1000,
    });
  }

  return {
    allowed,
    matchedPolicy,
    evaluationTimeMs: 0, // Set by caller
    reason: allowed ? "policy_match" : "no_matching_policy",
    model: "rbac",
  };
}

/**
 * Extract the resource identifier from an MCP method and params.
 */
function extractResource(
  method: string,
  params?: Record<string, unknown>
): string {
  switch (method) {
    case MCP_METHODS.TOOLS_CALL:
      return `tool:${(params?.name as string) ?? "*"}`;
    case MCP_METHODS.TOOLS_LIST:
      return "tool:*";
    case MCP_METHODS.RESOURCES_READ:
      return `resource:${(params?.uri as string) ?? "*"}`;
    case MCP_METHODS.RESOURCES_LIST:
      return "resource:*";
    case MCP_METHODS.PROMPTS_GET:
      return `prompt:${(params?.name as string) ?? "*"}`;
    case MCP_METHODS.PROMPTS_LIST:
      return "prompt:*";
    case MCP_METHODS.INITIALIZE:
    case MCP_METHODS.PING:
      return "system:lifecycle";
    default:
      return `method:${method}`;
  }
}

/**
 * Extract the action from an MCP method.
 */
function extractAction(method: string): string {
  if (method.includes("list") || method.includes("read")) return "read";
  if (method.includes("call") || method.includes("get")) return "execute";
  if (method.includes("subscribe")) return "subscribe";
  return "execute";
}

/**
 * Admin API: Add a new policy rule at runtime.
 */
export async function addPolicy(
  sub: string,
  obj: string,
  act: string
): Promise<boolean> {
  if (!enforcer) throw new Error("Enforcer not initialized");
  decisionCache.clear();
  return enforcer.addPolicy(sub, obj, act);
}

/**
 * Admin API: Remove a policy rule at runtime.
 */
export async function removePolicy(
  sub: string,
  obj: string,
  act: string
): Promise<boolean> {
  if (!enforcer) throw new Error("Enforcer not initialized");
  decisionCache.clear();
  return enforcer.removePolicy(sub, obj, act);
}

/**
 * Admin API: Add a role assignment.
 */
export async function addRoleForUser(
  user: string,
  role: string
): Promise<boolean> {
  if (!enforcer) throw new Error("Enforcer not initialized");
  decisionCache.clear();
  return enforcer.addRoleForUser(user, role);
}

/**
 * Admin API: List all policies.
 */
export async function listPolicies(): Promise<string[][]> {
  if (!enforcer) throw new Error("Enforcer not initialized");
  return enforcer.getPolicy();
}
