import type { GroupDetail, RoleBinding } from '@/types/api';

/** Roles bound to a user subject (email preferred, else principal id). */
export function userRolesFor(subject: string, bindings: RoleBinding[]): string[] {
  return [...new Set(bindings.filter((b) => b.user === subject).map((b) => b.role))];
}

/**
 * Groups a user can access, mirroring the gateway's enforcement:
 *   - open groups (no allowedRoles and no allowedUsers) → everyone
 *   - role gate → one of the user's roles is in allowedRoles
 *   - user gate → the user's email/id is in allowedUsers
 */
export function accessibleGroups(
  groups: GroupDetail[],
  opts: { email?: string; principalId: string; roles: string[] },
): GroupDetail[] {
  const ids = new Set([opts.email, opts.principalId].filter(Boolean) as string[]);
  return groups.filter((g) => {
    const roleGate = (g.allowedRoles?.length ?? 0) > 0;
    const userGate = (g.allowedUsers?.length ?? 0) > 0;
    if (!roleGate && !userGate) return true;
    const roleOk = roleGate && g.allowedRoles.some((r) => opts.roles.includes(r));
    const userOk = userGate && g.allowedUsers.some((u) => ids.has(u));
    return roleOk || userOk;
  });
}

/** Distinct tool names declared across the given groups. */
export function accessibleToolNames(groups: GroupDetail[]): string[] {
  return [...new Set(groups.flatMap((g) => g.tools ?? []))].sort();
}
