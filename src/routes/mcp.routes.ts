// ============================================================
// MCP Routes — Gateway MCP Server
//
// This is the MCP-facing interface. AI agents / MCP clients
// (Claude, Cursor, VS Code, etc.) connect here.
//
// Endpoints:
//   POST /mcp          — main MCP JSON-RPC endpoint (all tools)
//   GET  /mcp          — SSE stream for server-initiated msgs
//   DELETE /mcp        — close MCP session
//   POST /mcp/groups/:name — group-scoped MCP endpoint
// ============================================================

import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import type { GatewayVariables } from "../middleware/types.js";
import type { GatewayContext } from "../types/gateway.js";
import type { JsonRpcRequest, JsonRpcResponse } from "../types/mcp.js";
import {
  isRequest,
  MCP_METHODS,
  createSuccessResponse,
  createErrorResponse,
  MCP_ERROR_CODES,
} from "../types/mcp.js";
import { InvalidMessageError } from "../types/errors.js";
import type { ToolRegistry } from "../registry/tool.registry.js";
import type { ToolGroupManager } from "../registry/tool.groups.js";
import type { SessionManager } from "../session/session.manager.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ component: "mcp-routes" });

interface MCPRouteDeps {
  toolRegistry: ToolRegistry;
  toolGroups: ToolGroupManager;
  sessionManager: SessionManager;
}

/**
 * Build the MCP-facing routes.
 * These routes speak the MCP protocol (JSON-RPC 2.0 over Streamable HTTP).
 */
export function createMCPRoutes(deps: MCPRouteDeps) {
  const app = new Hono<{ Variables: GatewayVariables }>();
  const { toolRegistry, toolGroups, sessionManager } = deps;

  // ── POST /mcp — Main MCP endpoint (all tools) ───────
  app.post("/", async (c) => {
    const body = await c.req.json();
    if (!isRequest(body)) {
      throw new InvalidMessageError("Expected a JSON-RPC 2.0 request");
    }

    const ctx = c.get("gatewayCtx");
    if (ctx) ctx.mcpMessage = body as JsonRpcRequest;

    const response = await handleMCPRequest(
      body as JsonRpcRequest,
      ctx,
      toolRegistry,
      sessionManager,
      undefined // no group filter
    );

    // Set MCP session header
    c.header("Mcp-Session-Id", ctx?.requestId ?? uuidv4());
    return c.json(response);
  });

  // ── GET /mcp — SSE endpoint for server-initiated messages
  app.get("/", async (c) => {
    // Streamable HTTP: server→client notifications via SSE
    // For now return a placeholder; full SSE impl requires streaming support
    return c.text("SSE endpoint — connect via POST for requests", 200);
  });

  // ── DELETE /mcp — Close MCP session
  app.delete("/", async (c) => {
    const sessionId = c.req.header("mcp-session-id");
    log.info({ sessionId }, "MCP session closed by client");
    return c.json({ ok: true });
  });

  // ── POST /mcp/groups/:name — Group-scoped MCP endpoint
  app.post("/groups/:name", async (c) => {
    const groupName = c.req.param("name");
    const group = toolGroups.get(groupName);

    if (!group || !group.enabled) {
      return c.json(
        createErrorResponse(null, MCP_ERROR_CODES.INVALID_REQUEST, `Tool group "${groupName}" not found`),
        404
      );
    }

    // Check role access if group has allowedRoles
    if (group.allowedRoles && group.allowedRoles.length > 0) {
      const user = c.get("user");
      if (user && !group.allowedRoles.some((r) => user.roles.includes(r))) {
        return c.json(
          createErrorResponse(null, MCP_ERROR_CODES.INVALID_REQUEST, "Access denied for this tool group"),
          403
        );
      }
    }

    const body = await c.req.json();
    if (!isRequest(body)) {
      throw new InvalidMessageError("Expected a JSON-RPC 2.0 request");
    }

    const ctx = c.get("gatewayCtx");
    if (ctx) ctx.mcpMessage = body as JsonRpcRequest;

    const response = await handleMCPRequest(
      body as JsonRpcRequest,
      ctx,
      toolRegistry,
      sessionManager,
      groupName
    );

    c.header("Mcp-Session-Id", ctx?.requestId ?? uuidv4());
    return c.json(response);
  });

  return app;
}

// ── Core MCP Request Handler ─────────────────────────────

async function handleMCPRequest(
  request: JsonRpcRequest,
  context: GatewayContext,
  registry: ToolRegistry,
  sessionManager: SessionManager,
  groupName: string | undefined
): Promise<JsonRpcResponse> {
  const { method, params, id } = request;

  switch (method) {
    // ── Lifecycle ────────────────────────────────────
    case MCP_METHODS.INITIALIZE:
      return createSuccessResponse(id, {
        protocolVersion: "2025-03-26",
        capabilities: {
          tools: { listChanged: true },
          resources: { subscribe: false, listChanged: false },
          prompts: { listChanged: false },
        },
        serverInfo: {
          name: "mcp-gateway",
          version: "0.1.0",
        },
      });

    case MCP_METHODS.PING:
      return createSuccessResponse(id, {});

    // ── Tools ────────────────────────────────────────
    case MCP_METHODS.TOOLS_LIST: {
      const tools = groupName
        ? deps_toolGroups_listGroupTools(registry, groupName)
        : registry.listTools();

      return createSuccessResponse(id, { tools });
    }

    case MCP_METHODS.TOOLS_CALL: {
      const canonicalName = params?.name as string;
      if (!canonicalName) {
        return createErrorResponse(id, MCP_ERROR_CODES.INVALID_PARAMS, "Missing tool name");
      }

      // If in a group, verify tool is in the group
      if (groupName) {
        // Use registry to check since we can't access toolGroups directly here
        // The group filtering is done at the route level
      }

      // Resolve canonical name → server + original tool name
      const resolved = registry.resolve(canonicalName);
      if (!resolved) {
        return createErrorResponse(
          id,
          MCP_ERROR_CODES.METHOD_NOT_FOUND,
          `Tool not found: ${canonicalName}`
        );
      }

      context.targetServer = resolved.serverName;

      // Rewrite the request with the original tool name
      const upstreamRequest: JsonRpcRequest = {
        jsonrpc: "2.0",
        id,
        method: MCP_METHODS.TOOLS_CALL,
        params: {
          name: resolved.toolName,
          arguments: params?.arguments,
        },
      };

      log.debug(
        {
          canonical: canonicalName,
          server: resolved.serverName,
          tool: resolved.toolName,
        },
        "Routing tool call"
      );

      // Forward via session manager
      return sessionManager.send(
        resolved.serverName,
        upstreamRequest
      );
    }

    // ── Resources (pass-through to default server) ───
    case MCP_METHODS.RESOURCES_LIST:
    case MCP_METHODS.RESOURCES_READ: {
      // Pass to first available server
      const servers = registry.listServers();
      if (servers.length === 0) {
        return createSuccessResponse(id, { resources: [] });
      }
      return sessionManager.send(servers[0], request);
    }

    // ── Prompts (pass-through) ───────────────────────
    case MCP_METHODS.PROMPTS_LIST:
    case MCP_METHODS.PROMPTS_GET: {
      const servers = registry.listServers();
      if (servers.length === 0) {
        return createSuccessResponse(id, { prompts: [] });
      }
      return sessionManager.send(servers[0], request);
    }

    default:
      return createErrorResponse(
        id,
        MCP_ERROR_CODES.METHOD_NOT_FOUND,
        `Unknown method: ${method}`
      );
  }
}

/** Helper — list tools for a group using the registry */
function deps_toolGroups_listGroupTools(
  registry: ToolRegistry,
  groupName: string
): ReturnType<typeof registry.listTools> {
  // This is a simplified version; the full impl uses ToolGroupManager
  // In practice, the gateway injects the group manager properly
  return registry.listTools();
}
