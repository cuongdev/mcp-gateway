export interface CachedValue {
  body: string;            // JSON-serialized response body
  contentType: string;
}

export interface ToolCache {
  get(key: string): Promise<CachedValue | null>;
  set(key: string, value: CachedValue, ttlSec: number, ctx: { tool: string; principalId?: string }): Promise<void>;
  invalidateTool(tool: string): Promise<number>;
  invalidatePrincipal(principalId: string): Promise<number>;
  shutdown?(): Promise<void>;
}
