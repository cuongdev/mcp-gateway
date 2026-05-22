// ============================================================
// MCP Protocol Types
// Based on MCP Specification 2025-03-26
// ============================================================

/** JSON-RPC 2.0 base types */
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

/** MCP Standard Error Codes */
export const MCP_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

/** MCP Methods */
export const MCP_METHODS = {
  // Lifecycle
  INITIALIZE: "initialize",
  INITIALIZED: "notifications/initialized",
  PING: "ping",

  // Tools
  TOOLS_LIST: "tools/list",
  TOOLS_CALL: "tools/call",

  // Resources
  RESOURCES_LIST: "resources/list",
  RESOURCES_READ: "resources/read",
  RESOURCES_SUBSCRIBE: "resources/subscribe",
  RESOURCES_UNSUBSCRIBE: "resources/unsubscribe",
  RESOURCES_TEMPLATES_LIST: "resources/templates/list",

  // Prompts
  PROMPTS_LIST: "prompts/list",
  PROMPTS_GET: "prompts/get",

  // Roots (reverse channel — gateway exposes admin view only in v1)
  ROOTS_LIST: "roots/list",

  // Sampling (reverse channel — full mux deferred to v0.9; gateway logs attempts in v0.8)
  SAMPLING_CREATE_MESSAGE: "sampling/createMessage",

  // Logging
  LOG_SET_LEVEL: "logging/setLevel",

  // Completion
  COMPLETION: "completion/complete",
} as const;

/** MCP Tool definition */
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

/** MCP Resource definition */
export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/** MCP Prompt definition */
export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

/** MCP Tool Call params */
export interface ToolCallParams {
  name: string;
  arguments?: Record<string, unknown>;
}

/** MCP Server capabilities */
export interface MCPServerCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  logging?: Record<string, unknown>;
}

/** MCP Initialize result */
export interface MCPInitializeResult {
  protocolVersion: string;
  capabilities: MCPServerCapabilities;
  serverInfo: {
    name: string;
    version: string;
  };
}

/** Helper to create a JSON-RPC error response */
export function createErrorResponse(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, data },
  };
}

/** Helper to create a JSON-RPC success response */
export function createSuccessResponse(
  id: string | number,
  result: unknown
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

/** Check if a message is a request (has id + method) */
export function isRequest(msg: unknown): msg is JsonRpcRequest {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "jsonrpc" in msg &&
    "id" in msg &&
    "method" in msg
  );
}

/** Check if a message is a notification (has method, no id) */
export function isNotification(msg: unknown): msg is JsonRpcNotification {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "jsonrpc" in msg &&
    "method" in msg &&
    !("id" in msg)
  );
}

/** Check if a message is a response (has id, no method) */
export function isResponse(msg: unknown): msg is JsonRpcResponse {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "jsonrpc" in msg &&
    "id" in msg &&
    !("method" in msg)
  );
}
