export interface ResolveInput {
  serverProxyName?: string | null;
  groupProxyName?: string | null;
  globalDefaultName?: string | null;
}

export function resolveProxyName(input: ResolveInput): string | null {
  return input.serverProxyName ?? input.groupProxyName ?? input.globalDefaultName ?? null;
}
