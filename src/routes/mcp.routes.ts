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
import type { JsonRpcRequest, JsonRpcResponse, MCPTool } from "../types/mcp.js";
import {
  isRequest,
  MCP_METHODS,
  createSuccessResponse,
  createErrorResponse,
  MCP_ERROR_CODES,
} from "../types/mcp.js";
import { InvalidMessageError } from "../types/errors.js";
import type { ToolRegistry, RegisteredTool } from "../registry/tool.registry.js";
import type { ToolGroupManager } from "../registry/tool.groups.js";
import type { PromptRegistry } from "../registry/prompt.registry.js";
import type { SessionManager } from "../session/session.manager.js";
import { withSpan } from "../observability/spans.js";
import { logger } from "../utils/logger.js";

/** Map a RegisteredTool to the MCP-protocol tool shape. */
function toMCPTool(r: RegisteredTool): MCPTool {
  return {
    name: r.canonicalName,
    description: r.description,
    inputSchema: r.inputSchema as MCPTool["inputSchema"],
  };
}

/** Distinct server names known to the registry, sorted. */
function listKnownServers(registry: ToolRegistry): string[] {
  const set = new Set<string>();
  for (const t of registry.listAll()) set.add(t.serverName);
  return Array.from(set).sort();
}

/** Convert a JSON-schema-like object to MCP prompt `arguments` array. */
function schemaToMCPArguments(
  schema: Record<string, unknown>,
): Array<{ name: string; description?: string; required?: boolean }> {
  const properties =
    (schema.properties as Record<string, { description?: string }> | undefined) ?? {};
  const required = new Set((schema.required as string[] | undefined) ?? []);
  return Object.entries(properties).map(([name, def]) => ({
    name,
    description: def.description,
    required: required.has(name),
  }));
}

const log = logger.child({ component: "mcp-routes" });

interface MCPRouteDeps {
  toolRegistry: ToolRegistry;
  toolGroups: ToolGroupManager;
  sessionManager: SessionManager;
  promptRegistry: PromptRegistry;
}

/**
 * Build the MCP-facing routes.
 * These routes speak the MCP protocol (JSON-RPC 2.0 over Streamable HTTP).
 */
export function createMCPRoutes(deps: MCPRouteDeps) {
  const app = new Hono<{ Variables: GatewayVariables }>();
  const { toolRegistry, toolGroups, sessionManager, promptRegistry } = deps;

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
      toolGroups,
      sessionManager,
      promptRegistry,
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
      toolGroups,
      sessionManager,
      promptRegistry,
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
  groups: ToolGroupManager,
  sessionManager: SessionManager,
  promptRegistry: PromptRegistry,
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
      let tools: MCPTool[];
      if (groupName) {
        // Group-scoped listing: resolveTools() already filters to enabled tools.
        const canonical = groups.resolveTools(groupName);
        tools = canonical
          .map((cn) => registry.get(cn))
          .filter((t): t is RegisteredTool => !!t && t.enabled)
          .map(toMCPTool);
      } else {
        tools = registry.list().map(toMCPTool);
      }
      return createSuccessResponse(id, { tools });
    }

    case MCP_METHODS.TOOLS_CALL: {
      const canonicalName = params?.name as string;
      return withSpan(
        "mcp.tools.call",
        {
          "mcp.tool": canonicalName,
          "mcp.id": String(id ?? ""),
          "mcp.group": groupName,
        },
        async () => {
          if (!canonicalName) {
            return createErrorResponse(id, MCP_ERROR_CODES.INVALID_PARAMS, "Missing tool name");
          }

          // If in a group, verify the tool is in the group
          if (groupName) {
            const allowed = groups.resolveTools(groupName);
            if (!allowed.includes(canonicalName)) {
              return createErrorResponse(
                id,
                MCP_ERROR_CODES.METHOD_NOT_FOUND,
                `Tool '${canonicalName}' is not part of group '${groupName}'`
              );
            }
          }

          // Resolve canonical name → server + original tool name
          const resolved = registry.get(canonicalName);
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
              name: resolved.originalName,
              arguments: params?.arguments,
            },
          };

          log.debug(
            {
              canonical: canonicalName,
              server: resolved.serverName,
              tool: resolved.originalName,
            },
            "Routing tool call"
          );

          // Forward via session manager
          return sessionManager.send(resolved.serverName, upstreamRequest);
        },
      );
    }

    // ── Resources (pass-through to default server) ───
    case MCP_METHODS.RESOURCES_LIST:
    case MCP_METHODS.RESOURCES_READ: {
      // Pass to first available server
      const servers = listKnownServers(registry);
      if (servers.length === 0) {
        return createSuccessResponse(id, { resources: [] });
      }
      return sessionManager.send(servers[0], request);
    }

    // ── Prompts ──────────────────────────────────────
    case MCP_METHODS.PROMPTS_LIST: {
      const prompts = promptRegistry.list();
      return createSuccessResponse(id, {
        prompts: prompts.map((p) => ({
          name: p.canonicalName,
          description: p.description,
          arguments: schemaToMCPArguments(p.argumentsSchema),
        })),
      });
    }

    case MCP_METHODS.PROMPTS_GET: {
      const name = params?.name as string | undefined;
      const prompt = name ? promptRegistry.get(name) : undefined;
      if (!prompt || !prompt.enabled) {
        return createErrorResponse(
          id,
          MCP_ERROR_CODES.INVALID_PARAMS,
          `Prompt '${name ?? ""}' not found or disabled`
        );
      }
      const upstreamRequest: JsonRpcRequest = {
        jsonrpc: "2.0",
        id,
        method: MCP_METHODS.PROMPTS_GET,
        params: { ...(params ?? {}), name: prompt.originalName },
      };
      return sessionManager.send(prompt.serverName, upstreamRequest);
    }

    default:
      return createErrorResponse(
        id,
        MCP_ERROR_CODES.METHOD_NOT_FOUND,
        `Unknown method: ${method}`
      );
  }
}
