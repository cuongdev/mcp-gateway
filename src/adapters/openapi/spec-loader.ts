import SwaggerParser from '@apidevtools/swagger-parser';
import type { DiscoveredOpenApiTool } from './operation-to-tool.js';
import { operationToTool, type OpenApiOperation } from './operation-to-tool.js';

export interface SpecLoadOptions {
  specUrl?: string;
  specPath?: string;
  filter?: { tags?: string[]; operationIds?: string[]; exclude?: string[] };
}

export interface LoadedSpec {
  baseUrl: string | null;
  tools: DiscoveredOpenApiTool[];
}

export async function loadOpenApiSpec(opts: SpecLoadOptions): Promise<LoadedSpec> {
  const source = opts.specUrl ?? opts.specPath;
  if (!source) throw new Error('loadOpenApiSpec requires specUrl or specPath');
  const api = await SwaggerParser.dereference(source) as {
    servers?: Array<{ url: string }>;
    paths?: Record<string, Record<string, OpenApiOperation>>;
  };
  const baseUrl = api.servers?.[0]?.url ?? null;
  const tools: DiscoveredOpenApiTool[] = [];
  const includeOp = (op: OpenApiOperation) => {
    if (opts.filter?.exclude && op.operationId && opts.filter.exclude.includes(op.operationId)) return false;
    if (opts.filter?.operationIds && op.operationId && !opts.filter.operationIds.includes(op.operationId)) return false;
    if (opts.filter?.tags && !(op.tags ?? []).some((t) => opts.filter!.tags!.includes(t))) return false;
    return true;
  };
  for (const [path, methods] of Object.entries(api.paths ?? {})) {
    for (const [method, op] of Object.entries(methods)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method.toLowerCase())) continue;
      if (!includeOp(op)) continue;
      const t = operationToTool(path, method, op);
      if (t) tools.push(t);
    }
  }
  return { baseUrl, tools };
}
