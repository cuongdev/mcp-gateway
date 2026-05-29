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
import { streamSSE } from "hono/streaming";
import { v4 as uuidv4 } from "uuid";
import type { GatewayVariables } from "../middleware/types.js";
import type { GatewayContext } from "../types/gateway.js";
import type { JsonRpcRequest, JsonRpcResponse, MCPTool } from "../types/mcp.js";
import {
  isRequest,
  isResponse,
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
import { toolCallDuration } from "../middleware/monitoring/metrics.middleware.js";
import { logger } from "../utils/logger.js";
import type { RedactionEngineFactory } from "../redaction/factory.js";
import type { StorageAdapter } from "../storage/adapter.js";
import { RedactionBlock } from "../redaction/types.js";
import { newId } from "../utils/uuid.js";
import { createHash } from "node:crypto";

/** Short SHA-256 hash (first 16 hex chars) for sampling-log payload fingerprints. */
function hashShort(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}
import type { VirtualToolRepo, VirtualToolRow } from "../storage/repositories/virtual-tool.repo.js";
import type { VirtualToolExecutor } from "../virtual-tools/executor.js";
import type { VirtualToolPlan } from "../virtual-tools/types.js";
import type { ReverseChannelMux } from "../pipeline/reverse-channel.js";
import { HonoSseWriter } from "../transport/sse-writer.js";

/** Map a RegisteredTool to the MCP-protocol tool shape. */
function toMCPTool(r: RegisteredTool): MCPTool {
  return {
    name: r.canonicalName,
    description: r.description,
    inputSchema: r.inputSchema as MCPTool["inputSchema"],
  };
}

/** Map a stored virtual tool row to the MCP `tools/list` shape with `_virtual` marker. */
function virtualToMCPTool(vt: VirtualToolRow): MCPTool {
  let schema: Record<string, unknown> = { type: 'object' };
  try {
    const parsed = JSON.parse(vt.inputSchemaJson);
    if (parsed && typeof parsed === 'object') schema = parsed as Record<string, unknown>;
  } catch {
    /* keep default */
  }
  return {
    name: vt.canonicalName,
    description: vt.description ?? '',
    inputSchema: schema as MCPTool["inputSchema"],
    // Extension field: lets clients badge virtual tools in their UIs.
    _virtual: true,
  } as MCPTool & { _virtual: true };
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

/**
 * Resolve the stable MCP session id for a request.
 *
 * The MCP Streamable HTTP transport assigns a session via the
 * `Mcp-Session-Id` header: the gateway mints one on `initialize` and the
 * client echoes it on every subsequent POST and on the GET SSE stream.
 * That header — NOT the per-request `context.requestId` — is the identity
 * the reverse channel keys on, so POST `_meta.session_id` injection, GET
 * channel registration, and client-response intake all agree on one value.
 */
function resolveMcpSessionId(
  c: { req: { header(name: string): string | undefined } },
  ctx: GatewayContext | undefined,
): string {
  return c.req.header("mcp-session-id") ?? ctx?.requestId ?? uuidv4();
}

interface MCPRouteDeps {
  toolRegistry: ToolRegistry;
  toolGroups: ToolGroupManager;
  sessionManager: SessionManager;
  promptRegistry: PromptRegistry;
  /** Optional — for resources/list, /read, /templates/list (P8). */
  resourceRegistry?: import('../registry/resource.registry.js').ResourceRegistry;
  /** Optional — when present, /mcp tools/call applies redaction on request + response. */
  redactionFactory?: RedactionEngineFactory;
  storage?: StorageAdapter;
  /** P10 — when present, tools/list adds virtual tools and tools/call delegates. */
  virtualToolRepo?: VirtualToolRepo;
  virtualToolExecutor?: VirtualToolExecutor;
  /** v0.9 — when present, GET /mcp upgrades to SSE and registers the client channel. */
  reverseChannel?: ReverseChannelMux;
}

/**
 * Build the MCP-facing routes.
 * These routes speak the MCP protocol (JSON-RPC 2.0 over Streamable HTTP).
 */
export function createMCPRoutes(deps: MCPRouteDeps) {
  const app = new Hono<{ Variables: GatewayVariables }>();
  const { toolRegistry, toolGroups, sessionManager, promptRegistry } = deps;
  const redactionFactory = deps.redactionFactory;
  const storage = deps.storage;

  // ── POST /mcp — Main MCP endpoint (all tools) ───────
  app.post("/", async (c) => {
    const body = await c.req.json();
    const ctx = c.get("gatewayCtx");
    const sessionId = resolveMcpSessionId(c, ctx);

    // v0.9 reverse channel — a JSON-RPC *response* (id, no method) on this
    // endpoint is the client answering a server-initiated reverse request
    // (e.g. sampling/createMessage) it received over the GET SSE stream.
    // Hand it to the mux, which enforces session ownership, then ack 202.
    if (isResponse(body)) {
      const mux = deps.reverseChannel;
      if (mux && body.id != null) {
        const matched = mux.resolveFromClient(String(body.id), sessionId, body);
        if (!matched) {
          log.debug(
            { sessionId, id: body.id },
            "reverse response had no matching pending request for this session",
          );
        }
      }
      c.header("Mcp-Session-Id", sessionId);
      return c.body(null, 202);
    }

    if (!isRequest(body)) {
      throw new InvalidMessageError("Expected a JSON-RPC 2.0 request");
    }

    if (ctx) ctx.mcpMessage = body as JsonRpcRequest;

    const response = await handleMCPRequest(
      body as JsonRpcRequest,
      ctx,
      sessionId,
      toolRegistry,
      toolGroups,
      sessionManager,
      promptRegistry,
      undefined, // no group filter
      redactionFactory,
      storage,
      deps.resourceRegistry,
      { virtualToolRepo: deps.virtualToolRepo, virtualToolExecutor: deps.virtualToolExecutor },
    );

    // Echo the stable MCP session id so the client reuses it on the GET
    // SSE stream and on subsequent calls.
    c.header("Mcp-Session-Id", sessionId);
    return c.json(response);
  });

  // ── GET /mcp — SSE endpoint for server-initiated messages
  app.get("/", async (c) => {
    const mux = deps.reverseChannel;
    if (!mux) {
      // No reverse-channel mux wired — keep v0.8 placeholder behaviour.
      return c.text("SSE endpoint — connect via POST for requests", 200);
    }

    // Honour the client's Mcp-Session-Id if supplied, otherwise mint one.
    // Same resolution as POST /mcp so the channel key matches the session id
    // injected into upstream calls and used for client-response intake.
    const sessionId = resolveMcpSessionId(c, c.get("gatewayCtx"));
    c.header("Mcp-Session-Id", sessionId);

    return streamSSE(c, async (stream) => {
      const writer = new HonoSseWriter(stream, (err) => {
        log.debug({ err, sessionId }, "SSE write error");
      });
      const unregister = mux.registerClient(sessionId, writer);

      // 30s heartbeat keeps proxies / load balancers from closing the
      // idle stream. We treat every successful write as an aliveness
      // signal; a write failure latches `writer.closed = true` which
      // breaks the loop on the next tick.
      const heartbeatTimer = setInterval(() => {
        if (writer.closed) return;
        writer.send({ type: "heartbeat", ts: Date.now() });
      }, 30_000);
      // Don't hold the event loop open just for the heartbeat.
      heartbeatTimer.unref?.();

      // Stay alive until the stream aborts. Hono fires `onAbort` when
      // the underlying Response is cancelled (client disconnects), and
      // sets `aborted = true` if it already fired before we attach.
      await new Promise<void>((resolve) => {
        if (stream.aborted || stream.closed) return resolve();
        stream.onAbort(() => resolve());
      });

      clearInterval(heartbeatTimer);
      unregister();
      writer.close();
    });
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
    const sessionId = resolveMcpSessionId(c, ctx);
    if (ctx) ctx.mcpMessage = body as JsonRpcRequest;

    const response = await handleMCPRequest(
      body as JsonRpcRequest,
      ctx,
      sessionId,
      toolRegistry,
      toolGroups,
      sessionManager,
      promptRegistry,
      groupName,
      redactionFactory,
      storage,
      deps.resourceRegistry,
      { virtualToolRepo: deps.virtualToolRepo, virtualToolExecutor: deps.virtualToolExecutor },
    );

    c.header("Mcp-Session-Id", sessionId);
    return c.json(response);
  });

  return app;
}

// ── Core MCP Request Handler ─────────────────────────────

interface HandleExtras {
  virtualToolRepo?: VirtualToolRepo;
  virtualToolExecutor?: VirtualToolExecutor;
}

async function handleMCPRequest(
  request: JsonRpcRequest,
  context: GatewayContext,
  mcpSessionId: string,
  registry: ToolRegistry,
  groups: ToolGroupManager,
  sessionManager: SessionManager,
  promptRegistry: PromptRegistry,
  groupName: string | undefined,
  redactionFactory?: RedactionEngineFactory,
  storage?: StorageAdapter,
  resourceRegistry?: import('../registry/resource.registry.js').ResourceRegistry,
  extras: HandleExtras = {},
): Promise<JsonRpcResponse> {
  const { method, params, id } = request;

  // When the call arrives via `/mcp/groups/:name`, propagate the group's
  // outbound proxy override (P5). Server-level proxyName still wins per
  // resolveProxyName precedence.
  const groupProxyName: string | null = groupName
    ? (groups.get(groupName)?.proxyName ?? null)
    : null;
  // v0.9 — bind the originating client session id onto every outbound
  // upstream call. The session manager injects this as `_meta.session_id`
  // so any reverse RPC the upstream initiates (sampling/createMessage,
  // roots/list, resources/updated) carries the session id back and the
  // ReverseChannelMux can fan it to the right client. This MUST be the
  // stable Mcp-Session-Id (shared with the GET SSE channel registration),
  // not the per-request requestId — otherwise no reverse RPC could ever
  // match a registered client channel.
  const originatingSessionId = mcpSessionId;
  const sendOpts:
    | { groupProxyName?: string | null; originatingSessionId?: string }
    | undefined =
    groupProxyName || originatingSessionId
      ? {
          ...(groupProxyName ? { groupProxyName } : {}),
          ...(originatingSessionId ? { originatingSessionId } : {}),
        }
      : undefined;

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
        // P10: merge in enabled virtual tools (group-scoped listings are not extended).
        if (extras.virtualToolRepo) {
          try {
            const vts = await extras.virtualToolRepo.list();
            for (const vt of vts) {
              if (!vt.enabled) continue;
              tools.push(virtualToMCPTool(vt));
            }
          } catch (err) {
            log.warn({ err }, 'failed to list virtual tools; serving native tools only');
          }
        }
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
          const toolStart = Date.now();
          try {
            if (!canonicalName) {
              toolCallDuration.observe({ tool: "unknown", result: "error" }, (Date.now() - toolStart) / 1000);
              return createErrorResponse(id, MCP_ERROR_CODES.INVALID_PARAMS, "Missing tool name");
            }

            // If in a group, verify the tool is in the group
            if (groupName) {
              const allowed = groups.resolveTools(groupName);
              if (!allowed.includes(canonicalName)) {
                toolCallDuration.observe({ tool: canonicalName, result: "error" }, (Date.now() - toolStart) / 1000);
                return createErrorResponse(
                  id,
                  MCP_ERROR_CODES.METHOD_NOT_FOUND,
                  `Tool '${canonicalName}' is not part of group '${groupName}'`
                );
              }
            }

            // P10: virtual tool delegation. Checked before the native registry
            // lookup so a virtual-tool name shadowing a native canonical wins.
            if (extras.virtualToolRepo && extras.virtualToolExecutor) {
              const vt = await extras.virtualToolRepo.findByName(canonicalName).catch(() => null);
              if (vt && vt.enabled) {
                try {
                  const plan = JSON.parse(vt.planJson) as VirtualToolPlan;
                  const tenantId = ((context as { tenantId?: string })?.tenantId) ?? undefined;
                  const principalId =
                    ((context as { user?: { id?: string } })?.user?.id) ?? undefined;
                  const result = await extras.virtualToolExecutor.execute(
                    plan,
                    params?.arguments,
                    { tenantId, principalId },
                  );
                  toolCallDuration.observe(
                    { tool: canonicalName, result: "success" },
                    (Date.now() - toolStart) / 1000,
                  );
                  return createSuccessResponse(id, result);
                } catch (err) {
                  toolCallDuration.observe(
                    { tool: canonicalName, result: "error" },
                    (Date.now() - toolStart) / 1000,
                  );
                  return createErrorResponse(
                    id,
                    MCP_ERROR_CODES.INTERNAL_ERROR,
                    `Virtual tool '${canonicalName}' failed: ${(err as Error)?.message ?? String(err)}`,
                  );
                }
              }
            }

            // Resolve canonical name → server + original tool name
            const resolved = registry.get(canonicalName);
            if (!resolved) {
              toolCallDuration.observe({ tool: canonicalName, result: "error" }, (Date.now() - toolStart) / 1000);
              return createErrorResponse(
                id,
                MCP_ERROR_CODES.METHOD_NOT_FOUND,
                `Tool not found: ${canonicalName}`
              );
            }

            context.targetServer = resolved.serverName;

            // ── Redaction: scan request arguments ───────
            let scannedArguments = params?.arguments;
            const requestId = (context?.requestId as string | undefined) ?? newId();
            const principalId = ((context as { user?: { id?: string } })?.user?.id) ?? null;
            if (redactionFactory && scannedArguments !== undefined) {
              try {
                const engine = await redactionFactory.getEngine('tnt_default');
                const scan = engine.scan(scannedArguments, 'request');
                scannedArguments = scan.value;
                if (scan.findings.length > 0 && storage) {
                  await storage.redactionFindings.recordMany(
                    scan.findings.map((f) => ({
                      id: `rfd_${newId().slice(4)}`,
                      ruleId: f.ruleId,
                      requestId,
                      capabilityName: canonicalName,
                      capabilityKind: 'tool',
                      serverName: resolved.serverName,
                      scope: 'request',
                      mode: f.mode,
                      matchCount: f.count,
                      principalId,
                    })),
                  ).catch((err) => log.warn({ err }, 'failed to record redaction findings'));
                }
              } catch (err) {
                if (err instanceof RedactionBlock) {
                  toolCallDuration.observe({ tool: canonicalName, result: "error" }, (Date.now() - toolStart) / 1000);
                  // Record the block as a finding before returning the error.
                  if (storage) {
                    storage.redactionFindings.recordMany([{
                      id: `rfd_${newId().slice(4)}`,
                      ruleId: err.rule.id,
                      requestId,
                      capabilityName: canonicalName,
                      capabilityKind: 'tool',
                      serverName: resolved.serverName,
                      scope: 'request',
                      mode: 'block',
                      matchCount: err.count,
                      principalId,
                    }]).catch(() => undefined);
                  }
                  return createErrorResponse(
                    id,
                    -32000,
                    `Request blocked by redaction rule '${err.rule.name}'`,
                  );
                }
                // Defensive: any other engine failure passes through (don't break user calls).
                log.warn({ err }, 'redaction request scan failed; passing through');
              }
            }

            // Rewrite the request with the original tool name + redacted args
            const upstreamRequest: JsonRpcRequest = {
              jsonrpc: "2.0",
              id,
              method: MCP_METHODS.TOOLS_CALL,
              params: {
                name: resolved.originalName,
                arguments: scannedArguments,
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

            // Forward via session manager (with optional group proxy ctx)
            let result = await sessionManager.send(
              resolved.serverName,
              upstreamRequest,
              sendOpts,
            );

            // ── Redaction: scan response content ────────
            if (redactionFactory && result && typeof result === 'object' && 'result' in result) {
              try {
                const engine = await redactionFactory.getEngine('tnt_default');
                const scan = engine.scan((result as { result: unknown }).result, 'response');
                (result as { result: unknown }).result = scan.value;
                if (scan.findings.length > 0 && storage) {
                  await storage.redactionFindings.recordMany(
                    scan.findings.map((f) => ({
                      id: `rfd_${newId().slice(4)}`,
                      ruleId: f.ruleId,
                      requestId,
                      capabilityName: canonicalName,
                      capabilityKind: 'tool',
                      serverName: resolved.serverName,
                      scope: 'response',
                      mode: f.mode,
                      matchCount: f.count,
                      principalId,
                    })),
                  ).catch((err) => log.warn({ err }, 'failed to record redaction findings'));
                }
              } catch (err) {
                if (err instanceof RedactionBlock) {
                  if (storage) {
                    storage.redactionFindings.recordMany([{
                      id: `rfd_${newId().slice(4)}`,
                      ruleId: err.rule.id,
                      requestId,
                      capabilityName: canonicalName,
                      capabilityKind: 'tool',
                      serverName: resolved.serverName,
                      scope: 'response',
                      mode: 'block',
                      matchCount: err.count,
                      principalId,
                    }]).catch(() => undefined);
                  }
                  toolCallDuration.observe({ tool: canonicalName, result: "error" }, (Date.now() - toolStart) / 1000);
                  return createErrorResponse(
                    id,
                    -32000,
                    `Response blocked by redaction rule '${err.rule.name}'`,
                  );
                }
                log.warn({ err }, 'redaction response scan failed; passing through');
              }
            }

            toolCallDuration.observe({ tool: canonicalName, result: "success" }, (Date.now() - toolStart) / 1000);
            return result;
          } catch (err) {
            toolCallDuration.observe({ tool: canonicalName ?? "unknown", result: "error" }, (Date.now() - toolStart) / 1000);
            throw err;
          }
        },
      );
    }

    // ── Resources (P8) ──────────────────────────────
    case MCP_METHODS.RESOURCES_LIST: {
      if (!resourceRegistry) return createSuccessResponse(id, { resources: [] });
      const resources = resourceRegistry.list()
        .filter((r) => r.enabled)
        .map((r) => ({
          uri: r.uri,
          name: r.name || r.canonicalName,
          description: r.description || undefined,
          mimeType: r.mimeType,
        }));
      return createSuccessResponse(id, { resources });
    }

    case MCP_METHODS.RESOURCES_TEMPLATES_LIST: {
      if (!resourceRegistry) return createSuccessResponse(id, { resourceTemplates: [] });
      const resourceTemplates = resourceRegistry.listTemplates().map((t) => ({
        uriTemplate: t.uriTemplate,
        name: t.name ?? undefined,
        description: t.description ?? undefined,
        mimeType: t.mimeType ?? undefined,
      }));
      return createSuccessResponse(id, { resourceTemplates });
    }

    case MCP_METHODS.RESOURCES_READ: {
      const uri = params?.uri as string | undefined;
      if (!uri) {
        return createErrorResponse(id, MCP_ERROR_CODES.INVALID_PARAMS, "Missing 'uri' param");
      }
      // Find which server owns this URI
      let serverName: string | undefined;
      if (resourceRegistry) {
        const match = resourceRegistry.list().find((r) => r.uri === uri && r.enabled);
        if (match) serverName = match.serverName;
      }
      if (!serverName) {
        // Fallback: try first server (may match URI template-style)
        const servers = listKnownServers(registry);
        if (servers.length === 0) {
          return createErrorResponse(id, MCP_ERROR_CODES.METHOD_NOT_FOUND, `Resource '${uri}' not registered`);
        }
        serverName = servers[0];
      }
      return sessionManager.send(serverName, request, sendOpts);
    }

    case MCP_METHODS.RESOURCES_SUBSCRIBE:
    case MCP_METHODS.RESOURCES_UNSUBSCRIBE: {
      // Forward to the server owning the URI (v1: no client re-publish)
      const uri = params?.uri as string | undefined;
      if (!uri) return createErrorResponse(id, MCP_ERROR_CODES.INVALID_PARAMS, "Missing 'uri' param");
      let serverName: string | undefined;
      if (resourceRegistry) {
        const match = resourceRegistry.list().find((r) => r.uri === uri && r.enabled);
        if (match) serverName = match.serverName;
      }
      if (!serverName) {
        const servers = listKnownServers(registry);
        if (servers.length === 0) {
          return createErrorResponse(id, MCP_ERROR_CODES.METHOD_NOT_FOUND, `Resource '${uri}' not registered`);
        }
        serverName = servers[0];
      }
      return sessionManager.send(serverName, request, sendOpts);
    }

    case MCP_METHODS.COMPLETION: {
      // completion/complete — params.ref identifies the prompt or resource being completed
      const ref = (params as Record<string, unknown> | undefined)?.ref as { type?: string; name?: string; uri?: string } | undefined;
      let serverName: string | undefined;
      if (ref?.type === 'ref/prompt' && ref.name) {
        const p = promptRegistry.get(ref.name);
        if (p) serverName = p.serverName;
      } else if (ref?.type === 'ref/resource' && ref.uri && resourceRegistry) {
        const match = resourceRegistry.list().find((r) => r.uri === ref.uri);
        if (match) serverName = match.serverName;
      }
      if (!serverName) {
        const servers = listKnownServers(registry);
        if (servers.length === 0) {
          return createSuccessResponse(id, { completion: { values: [], total: 0, hasMore: false } });
        }
        serverName = servers[0];
      }
      return sessionManager.send(serverName, request, sendOpts);
    }

    case MCP_METHODS.LOG_SET_LEVEL: {
      // Broadcast to all known servers (best-effort)
      const servers = listKnownServers(registry);
      const results = await Promise.allSettled(
        servers.map((s) => sessionManager.send(s, request, sendOpts)),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed === servers.length && servers.length > 0) {
        return createErrorResponse(id, MCP_ERROR_CODES.INTERNAL_ERROR, "All upstreams rejected logging/setLevel");
      }
      return createSuccessResponse(id, {});
    }

    case MCP_METHODS.ROOTS_LIST: {
      // In v1 the gateway returns its own roots view (admin-managed),
      // not a fan-out reverse channel to clients. Empty list is spec-valid.
      // Audit the attempt so admins can see when clients ask for roots.
      if (storage) {
        const sessionId = context?.requestId ?? 'unknown';
        const principalId = ((context as { user?: { id?: string } })?.user?.id) ?? null;
        await storage.samplingLog.record({
          id: `sl_${newId().slice(4)}`,
          requestId: String(id ?? sessionId),
          upstreamServer: 'gateway',
          clientSessionId: sessionId,
          principalId,
          method: 'roots/list',
          requestPayloadHash: hashShort(JSON.stringify(request)),
          outcome: 'success',
        }).catch(() => undefined);
      }
      return createSuccessResponse(id, { roots: [] });
    }

    case MCP_METHODS.SAMPLING_CREATE_MESSAGE: {
      // Reverse-channel sampling: in v0.8 the gateway has no mux to fan back
      // to the client, so direct client-initiated calls are recorded then
      // rejected with method_not_supported. v0.9 wires the SSE mux.
      if (storage) {
        const sessionId = context?.requestId ?? 'unknown';
        const principalId = ((context as { user?: { id?: string } })?.user?.id) ?? null;
        await storage.samplingLog.record({
          id: `sl_${newId().slice(4)}`,
          requestId: String(id ?? sessionId),
          upstreamServer: 'unknown',
          clientSessionId: sessionId,
          principalId,
          method: 'sampling/createMessage',
          requestPayloadHash: hashShort(JSON.stringify(request)),
          outcome: 'method_not_supported',
        }).catch(() => undefined);
      }
      return createErrorResponse(
        id,
        MCP_ERROR_CODES.METHOD_NOT_FOUND,
        "sampling/createMessage reverse channel is not yet implemented (deferred to v0.9). The attempt has been logged.",
      );
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
      return sessionManager.send(prompt.serverName, upstreamRequest, sendOpts);
    }

    default:
      return createErrorResponse(
        id,
        MCP_ERROR_CODES.METHOD_NOT_FOUND,
        `Unknown method: ${method}`
      );
  }
}
