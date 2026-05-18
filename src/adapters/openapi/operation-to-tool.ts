export interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: Array<{
    name: string;
    in: 'path' | 'query' | 'header' | 'cookie';
    required?: boolean;
    schema?: Record<string, unknown>;
    description?: string;
  }>;
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: Record<string, unknown> }>;
  };
  responses?: Record<string, { content?: Record<string, { schema?: Record<string, unknown> }> }>;
  tags?: string[];
}

export interface DiscoveredOpenApiTool {
  originalName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  meta: {
    method: string;
    path: string;
    operationId: string;
    paramLocations: Record<string, 'path' | 'query' | 'header'>;
    hasJsonBody: boolean;
  };
}

export function operationToTool(
  path: string, method: string, op: OpenApiOperation,
): DiscoveredOpenApiTool | null {
  if (!op.operationId) return null;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  const paramLocations: Record<string, 'path' | 'query' | 'header'> = {};

  for (const p of op.parameters ?? []) {
    if (p.in === 'cookie') continue;
    properties[p.name] = { ...(p.schema ?? { type: 'string' }), description: p.description };
    paramLocations[p.name] = p.in;
    if (p.required) required.push(p.name);
  }
  let hasJsonBody = false;
  const jsonBody = op.requestBody?.content?.['application/json']?.schema;
  if (jsonBody) {
    hasJsonBody = true;
    properties['body'] = jsonBody;
    if (op.requestBody?.required) required.push('body');
  }

  return {
    originalName: op.operationId,
    description: [op.summary, op.description].filter(Boolean).join(' — '),
    inputSchema: { type: 'object', properties, required },
    meta: {
      method: method.toUpperCase(), path, operationId: op.operationId,
      paramLocations, hasJsonBody,
    },
  };
}
