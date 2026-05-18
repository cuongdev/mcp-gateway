// ============================================================
// User Context Helper
// Utilities for working with authenticated user context
// ============================================================

import type { UserContext } from "../../types/gateway.js";

/**
 * Create an anonymous user context (for unauthenticated requests
 * when OIDC is disabled).
 */
export function createAnonymousUser(): UserContext {
  return {
    sub: "anonymous",
    roles: ["anonymous"],
    claims: {},
    issuer: "none",
    expiresAt: Infinity,
  };
}

/**
 * Check if user has a specific role.
 */
export function hasRole(user: UserContext, role: string): boolean {
  return user.roles.includes(role);
}

/**
 * Check if user has any of the specified roles.
 */
export function hasAnyRole(user: UserContext, roles: string[]): boolean {
  return roles.some((role) => user.roles.includes(role));
}

/**
 * Check if user has all of the specified roles.
 */
export function hasAllRoles(user: UserContext, roles: string[]): boolean {
  return roles.every((role) => user.roles.includes(role));
}

/**
 * Check if user belongs to a specific organization.
 */
export function isInOrg(user: UserContext, orgId: string): boolean {
  return user.orgId === orgId;
}

/**
 * Get a specific claim from the user context.
 */
export function getClaim<T = unknown>(
  user: UserContext,
  claimName: string
): T | undefined {
  return user.claims[claimName] as T | undefined;
}
