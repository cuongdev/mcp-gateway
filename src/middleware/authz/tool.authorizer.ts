// ============================================================
// Tool-Level Authorizer
// Fine-grained tool access control with parameter validation
// ============================================================

import type { UserContext } from "../../types/gateway.js";
import type { MCPTool, ToolCallParams } from "../../types/mcp.js";
import { ToolAccessDeniedError } from "../../types/errors.js";
import { logger } from "../../utils/logger.js";

const log = logger.child({ component: "tool-authorizer" });

/**
 * Tool access rule definition.
 * Allows fine-grained control over who can call what tools
 * and with what parameters.
 */
export interface ToolAccessRule {
  /** Tool name pattern (supports * wildcard) */
  toolPattern: string;
  /** Allowed roles (empty = all roles) */
  allowedRoles?: string[];
  /** Denied roles (takes precedence over allowed) */
  deniedRoles?: string[];
  /** Parameter constraints */
  paramConstraints?: ParameterConstraint[];
  /** Rate limit per user per minute */
  rateLimit?: number;
  /** Whether this tool requires explicit approval */
  requiresApproval?: boolean;
}

export interface ParameterConstraint {
  /** Parameter name (supports dot notation for nested) */
  paramName: string;
  /** Allowed values */
  allowedValues?: unknown[];
  /** Denied values */
  deniedValues?: unknown[];
  /** Max length for string params */
  maxLength?: number;
  /** Regex pattern for string params */
  pattern?: string;
}

/** In-memory rate limit tracker */
const rateLimits = new Map<string, { count: number; resetAt: number }>();

/**
 * Check if a user is authorized to call a specific tool
 * with specific parameters.
 */
export function authorizeToolCall(
  user: UserContext,
  toolCall: ToolCallParams,
  rules: ToolAccessRule[]
): { allowed: boolean; reason?: string } {
  const matchingRules = rules.filter((rule) =>
    matchToolPattern(rule.toolPattern, toolCall.name)
  );

  // If no rules match, default deny
  if (matchingRules.length === 0) {
    return { allowed: false, reason: "No matching tool access rule" };
  }

  for (const rule of matchingRules) {
    // Check denied roles first
    if (rule.deniedRoles?.some((role) => user.roles.includes(role))) {
      return {
        allowed: false,
        reason: `Role explicitly denied for tool: ${toolCall.name}`,
      };
    }

    // Check allowed roles
    if (
      rule.allowedRoles &&
      rule.allowedRoles.length > 0 &&
      !rule.allowedRoles.some((role) => user.roles.includes(role))
    ) {
      continue; // Try next rule
    }

    // Check parameter constraints
    if (rule.paramConstraints && toolCall.arguments) {
      const paramCheck = checkParameterConstraints(
        toolCall.arguments,
        rule.paramConstraints
      );
      if (!paramCheck.allowed) {
        return paramCheck;
      }
    }

    // Check rate limit
    if (rule.rateLimit) {
      const rateLimitCheck = checkRateLimit(
        user.sub,
        toolCall.name,
        rule.rateLimit
      );
      if (!rateLimitCheck.allowed) {
        return rateLimitCheck;
      }
    }

    // All checks passed
    return { allowed: true };
  }

  return { allowed: false, reason: "No matching role for tool access" };
}

/**
 * Match a tool name against a pattern.
 * Supports * as wildcard.
 */
function matchToolPattern(pattern: string, toolName: string): boolean {
  if (pattern === "*") return true;
  if (pattern === toolName) return true;

  // Convert glob pattern to regex
  const regex = new RegExp(
    "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
  );
  return regex.test(toolName);
}

/**
 * Validate tool parameters against constraints.
 */
function checkParameterConstraints(
  args: Record<string, unknown>,
  constraints: ParameterConstraint[]
): { allowed: boolean; reason?: string } {
  for (const constraint of constraints) {
    const value = getNestedValue(args, constraint.paramName);

    if (value === undefined) continue;

    // Check allowed values
    if (constraint.allowedValues && !constraint.allowedValues.includes(value)) {
      return {
        allowed: false,
        reason: `Parameter "${constraint.paramName}" value not in allowed list`,
      };
    }

    // Check denied values
    if (constraint.deniedValues?.includes(value)) {
      return {
        allowed: false,
        reason: `Parameter "${constraint.paramName}" value is denied`,
      };
    }

    // Check max length
    if (
      constraint.maxLength &&
      typeof value === "string" &&
      value.length > constraint.maxLength
    ) {
      return {
        allowed: false,
        reason: `Parameter "${constraint.paramName}" exceeds max length`,
      };
    }

    // Check pattern
    if (constraint.pattern && typeof value === "string") {
      if (!new RegExp(constraint.pattern).test(value)) {
        return {
          allowed: false,
          reason: `Parameter "${constraint.paramName}" does not match required pattern`,
        };
      }
    }
  }

  return { allowed: true };
}

/**
 * Check rate limit for a user + tool combination.
 */
function checkRateLimit(
  userId: string,
  toolName: string,
  maxPerMinute: number
): { allowed: boolean; reason?: string } {
  const key = `${userId}:${toolName}`;
  const now = Date.now();

  const entry = rateLimits.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimits.set(key, { count: 1, resetAt: now + 60000 });
    return { allowed: true };
  }

  if (entry.count >= maxPerMinute) {
    return {
      allowed: false,
      reason: `Rate limit exceeded: ${maxPerMinute}/minute for tool ${toolName}`,
    };
  }

  entry.count++;
  return { allowed: true };
}

/**
 * Get a nested value using dot notation.
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Filter a list of tools based on user permissions.
 * Returns only tools the user is authorized to see/execute.
 */
export function filterToolsByPermission(
  user: UserContext,
  tools: MCPTool[],
  rules: ToolAccessRule[]
): MCPTool[] {
  return tools.filter((tool) => {
    const result = authorizeToolCall(
      user,
      { name: tool.name },
      rules
    );
    return result.allowed;
  });
}
