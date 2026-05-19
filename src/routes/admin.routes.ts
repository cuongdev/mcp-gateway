// ============================================================
// Admin / HTTP API Routes
//
// This is the developer-facing REST API for managing the
// gateway. Separate from the MCP protocol endpoint.
//
// Endpoints:
//   GET    /api/health                — gateway health
//   GET    /api/metrics               — Prometheus metrics
//
//   GET    /api/servers               — list registered servers
//   POST   /api/servers               — register a server
//   DELETE /api/servers/:name         — deregister a server
//   POST   /api/servers/:name/sync    — re-sync tools from server
//
//   GET    /api/tools                 — list all tools
//   PUT    /api/tools/:name/enable    — enable a tool
//   PUT    /api/tools/:name/disable   — disable a tool
//
//   GET    /api/groups                — list tool groups
//   POST   /api/groups                — create a group
//   GET    /api/groups/:name          — get group details
//   PUT    /api/groups/:name          — update a group
//   DELETE /api/groups/:name          — delete a group
//   POST   /api/groups/:name/tools    — add tool to group
//   DELETE /api/groups/:name/tools/:tool — remove tool from group
//
//   GET    /api/policies              — list Casbin policies
//   POST   /api/policies              — add a policy
//   DELETE /api/policies              — remove a policy
//   POST   /api/policies/reload       — reload from file
//   POST   /api/roles                 — assign role to user
// ============================================================

import { Hono } from "hono";
import { z } from "zod";
import type { GatewayVariables } from "../middleware/types.js";
import type { GatewayConfig } from "../config/schema.js";
import type { ToolRegistry } from "../registry/tool.registry.js";
import type { ToolGroupManager } from "../registry/tool.groups.js";
import type { PromptRegistry } from "../registry/prompt.registry.js";
import type { SessionManager, TransportConfig } from "../session/session.manager.js";
import type { StorageAdapter } from "../storage/adapter.js";
import type { ServerTransportType } from "../storage/repositories/server.repo.js";
import { performHealthCheck } from "../middleware/monitoring/health.js";
import { getMetrics } from "../middleware/monitoring/metrics.middleware.js";
import {
  listPolicies,
  reloadPolicies,
  addPolicy,
  removePolicy,
  addRoleForUser,
  listRoleBindings,
  removeRoleForUser,
} from "../middleware/authz/policy.engine.js";
import { logger } from "../utils/logger.js";
import { createMcpClientsRoutes } from "./admin/mcp-clients.routes.js";
import { createUsersRoutes } from "./admin/users.routes.js";
import { createTokensRoutes } from "./admin/tokens.routes.js";
import { createPromptsRoutes } from "./admin/prompts.routes.js";
import { createUsageRoutes } from "./admin/usage.routes.js";
import { createCacheRoutes } from "./admin/cache.routes.js";
import { createSystemInfoRoutes } from "./admin/system-info.routes.js";
import type { ToolCache } from "../cache/interface.js";
import type { ProxyRegistry } from "../proxy/registry.js";

const log = logger.child({ component: "admin-api" });

interface AdminRouteDeps {
  config: GatewayConfig;
  storage: StorageAdapter;
  toolRegistry: ToolRegistry;
  toolGroups: ToolGroupManager;
  sessionManager: SessionManager;
  promptRegistry: PromptRegistry;
  /** Optional — only present when cache.enabled */
  cache?: ToolCache;
  /**
   * Optional ProxyRegistry — when present, POST /servers with `proxyName`
   * resolves the dispatcher and passes it to the OpenAPI adapter at
   * construction time (P5).
   *
   * May be a function so the gateway can pass a late-bound reference
   * (admin routes are constructed before ProxyRegistry is initialized).
   */
  proxyRegistry?: ProxyRegistry | (() => ProxyRegistry | undefined);
}

/**
 * Build the admin/developer REST API routes.
 */
export function createAdminRoutes(deps: AdminRouteDeps) {
  const app = new Hono<{ Variables: GatewayVariables }>();
  const { config, storage, toolRegistry, toolGroups, sessionManager } = deps;

  // ═══════════════════════════════════════════════════════
  // Health & Monitoring
  // ═══════════════════════════════════════════════════════

  app.get("/health", async (c) => {
    const health = performHealthCheck();
    const status = health.status === "unhealthy" ? 503 : 200;
    return c.json(health, status as any);
  });

  app.get("/metrics", async (c) => {
    const metrics = await getMetrics();
    c.header("Content-Type", "text/plain; version=0.0.4");
    return c.text(metrics);
  });

  // ═══════════════════════════════════════════════════════
  // Server Management
  // ═══════════════════════════════════════════════════════

  /** List all registered servers */
  app.get("/servers", async (c) => {
    // Aggregate servers from the in-memory tool registry. Each server is
    // represented by its name plus the canonical names of its tools.
    const byServer = new Map<string, string[]>();
    for (const t of toolRegistry.listAll()) {
      const list = byServer.get(t.serverName) ?? [];
      list.push(t.canonicalName);
      byServer.set(t.serverName, list);
    }
    const details = await Promise.all(
      Array.from(byServer.entries()).map(async ([name, tools]) => {
        const row = await storage.servers.findByName(name);
        return {
          name,
          tools,
          session: sessionManager.has(name),
          enabled: row?.enabled ?? true,
        };
      }),
    );
    return c.json({ servers: details });
  });

  /** Register a new MCP server */
  app.post("/servers", async (c) => {
    const body = await c.req.json() as {
      name: string;
      transport: TransportConfig | {
        type: "openapi";
        specUrl?: string;
        specPath?: string;
        baseUrl?: string;
        auth?: { type?: "bearer" | "apiKey"; token?: string; headerName?: string };
        filter?: { tags?: string[]; operationIds?: string[]; exclude?: string[] };
      };
      /** Optional outbound proxy override (P5). */
      proxyName?: string | null;
    };

    if (!body.name || !body.transport) {
      return c.json({ error: "name and transport are required" }, 400);
    }

    // ── OpenAPI branch ────────────────────────────────
    if (body.transport.type === "openapi") {
      const openapiTransport = body.transport;
      const openapiCfg = (deps.config as unknown as {
        openapi?: {
          enabled: boolean;
          allowedDomains: string[];
          blockPrivateIps: boolean;
          maxResponseBytes: number;
        };
      }).openapi ?? {
        enabled: true,
        allowedDomains: [],
        blockPrivateIps: true,
        maxResponseBytes: 10_000_000,
      };

      // Pre-check baseUrl through SSRF guard if explicitly provided.
      if (openapiTransport.baseUrl) {
        const { checkUrl } = await import("../adapters/openapi/ssrf-guard.js");
        const guard = await checkUrl(openapiTransport.baseUrl, {
          allowedDomains: openapiCfg.allowedDomains,
          blockPrivateIps: openapiCfg.blockPrivateIps,
        });
        if (!guard.ok) {
          return c.json(
            { error: { code: "ssrf_blocked", reason: guard.reason } },
            400,
          );
        }
      }

      // Pre-check specUrl through SSRF guard too — it's fetched server-side.
      if (openapiTransport.specUrl) {
        const { checkUrl } = await import("../adapters/openapi/ssrf-guard.js");
        const guard = await checkUrl(openapiTransport.specUrl, {
          allowedDomains: openapiCfg.allowedDomains,
          blockPrivateIps: openapiCfg.blockPrivateIps,
        });
        if (!guard.ok) {
          return c.json(
            { error: { code: "ssrf_blocked", reason: guard.reason } },
            400,
          );
        }
      }

      let loaded;
      try {
        const { loadOpenApiSpec } = await import(
          "../adapters/openapi/spec-loader.js"
        );
        loaded = await loadOpenApiSpec({
          specUrl: openapiTransport.specUrl,
          specPath: openapiTransport.specPath,
          filter: openapiTransport.filter,
        });
      } catch (err) {
        log.error({ server: body.name, err }, "Failed to load OpenAPI spec");
        return c.json(
          {
            error: {
              code: "openapi_spec_load_failed",
              detail: err instanceof Error ? err.message : String(err),
            },
          },
          400,
        );
      }

      if (loaded.tools.length > 200) {
        return c.json(
          { error: { code: "too_many_operations", count: loaded.tools.length } },
          400,
        );
      }

      try {
        await storage.servers.upsert({
          name: body.name,
          transportType: "openapi" as ServerTransportType,
          transportConfig: openapiTransport as unknown as Record<string, unknown>,
          autoDiscover: false,
        });
        if (body.proxyName !== undefined) {
          await storage.servers.setProxyName(body.name, body.proxyName);
        }
        await storage.tools.replaceServerTools(
          body.name,
          loaded.tools.map((t) => ({
            originalName: t.originalName,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        );
        await toolRegistry.load();
      } catch (err) {
        log.error({ server: body.name, err }, "Failed to persist OpenAPI server");
        return c.json({ error: "Failed to persist server" }, 500);
      }

      const { OpenApiAdapter } = await import("../adapters/openapi/adapter.js");
      sessionManager.clearOpenApiToolsForServer(body.name);
      sessionManager.markOpenApiServer(body.name);
      // Look up outbound proxy dispatcher for this server (P5). NOTE: the
      // dispatcher is captured at construction time — PATCH'ing proxyName
      // later does NOT refresh the adapter; re-register the server.
      const resolvedProxyRegistry = typeof deps.proxyRegistry === "function"
        ? deps.proxyRegistry()
        : deps.proxyRegistry;
      const openapiDispatcher = body.proxyName && resolvedProxyRegistry
        ? resolvedProxyRegistry.get(body.proxyName) ?? undefined
        : undefined;
      const adapter = new OpenApiAdapter(
        openapiTransport,
        openapiCfg,
        loaded.baseUrl,
        openapiDispatcher,
      );
      for (const t of loaded.tools) {
        sessionManager.registerOpenApiTool(
          `${body.name}__${t.originalName}`,
          adapter,
          t.meta,
        );
      }

      log.info(
        { server: body.name, toolCount: loaded.tools.length },
        "OpenAPI server registered and tools discovered",
      );

      return c.json({
        server: body.name,
        tools: loaded.tools.map((t) => `${body.name}__${t.originalName}`),
        discovered: loaded.tools.length,
      }, 201);
    }

    // ── Stdio / Streamable-HTTP branch ────────────────
    // Persist to storage so the server survives restarts.
    try {
      await storage.servers.upsert({
        name: body.name,
        transportType: body.transport.type as ServerTransportType,
        transportConfig: body.transport as unknown as Record<string, unknown>,
      });
      if (body.proxyName !== undefined) {
        await storage.servers.setProxyName(body.name, body.proxyName);
      }
    } catch (err) {
      log.error({ server: body.name, err }, "Failed to persist server");
      return c.json({ error: "Failed to persist server" }, 500);
    }

    // Register session
    sessionManager.register(body.name, body.transport);

    // Discover tools from the server (initialize handshake + tools/list)
    try {
      const tools = await sessionManager.discoverTools(body.name);
      await toolRegistry.registerServerTools(body.name, tools);

      log.info(
        { server: body.name, toolCount: tools.length },
        "Server registered and tools discovered"
      );

      // Discover prompts — swallow errors quietly (server may not support prompts/list)
      try {
        const prompts = await deps.sessionManager.discoverPrompts(body.name);
        await deps.promptRegistry.registerServerPrompts(
          body.name,
          prompts.map((p) => ({
            name: p.originalName,
            description: p.description,
            argumentsSchema: p.argumentsSchema,
          })),
        );
        log.info(
          { server: body.name, promptCount: prompts.length },
          "Prompts discovered"
        );
      } catch {
        // warn-level noop — many servers don't support prompts/list
        log.warn({ server: body.name }, "Prompt discovery failed (server may not support prompts/list)");
      }

      return c.json({
        server: body.name,
        tools: tools.map((t: any) => `${body.name}__${t.name}`),
      }, 201);
    } catch (err) {
      log.error({ server: body.name, err }, "Failed to discover tools");
      return c.json({
        server: body.name,
        tools: [],
        warning: "Server registered but tool discovery failed",
      }, 201);
    }
  });

  /** Deregister a server */
  app.delete("/servers/:name", async (c) => {
    const name = c.req.param("name");
    await toolRegistry.removeServer(name);
    sessionManager.remove(name);
    try {
      await storage.servers.deleteByName(name);
    } catch (err) {
      log.warn({ server: name, err }, "Failed to delete server from storage");
    }
    log.info({ server: name }, "Server deregistered");
    return c.json({ ok: true });
  });

  /** Enable or disable a server, or attach/detach an outbound proxy by name */
  app.patch("/servers/:name", async (c) => {
    const name = c.req.param("name");
    const existing = await storage.servers.findByName(name);
    if (!existing) return c.json({ error: { code: "not_found" } }, 404);
    const body = z.object({
      enabled: z.boolean().optional(),
      proxyName: z.string().nullable().optional(),
    }).parse(await c.req.json());
    if (body.enabled !== undefined) {
      await storage.servers.setEnabled(name, body.enabled);
    }
    if (body.proxyName !== undefined) {
      await storage.servers.setProxyName(name, body.proxyName);
    }
    return c.json({ ok: true });
  });

  /** Re-sync tools from a server */
  app.post("/servers/:name/sync", async (c) => {
    const name = c.req.param("name");

    if (!sessionManager.has(name)) {
      return c.json({ error: `Server "${name}" not registered` }, 404);
    }

    try {
      const tools = await sessionManager.discoverTools(name);
      await toolRegistry.registerServerTools(name, tools);

      return c.json({
        server: name,
        tools: tools.map((t: any) => `${name}__${t.name}`),
      });
    } catch (err) {
      return c.json({ error: "Tool sync failed", details: String(err) }, 500);
    }
  });

  // ═══════════════════════════════════════════════════════
  // Tool Management
  // ═══════════════════════════════════════════════════════

  /** List all registered tools */
  app.get("/tools", async (c) => {
    const all = c.req.query("all") === "true";
    const tools = all ? toolRegistry.listAll() : toolRegistry.listAll().filter((t) => t.enabled);
    return c.json({
      tools: tools.map((t) => ({
        name: t.canonicalName,
        server: t.serverName,
        originalName: t.originalName,
        description: t.description,
        enabled: t.enabled,
        cacheable: t.cacheable,
        cacheTtlSec: t.cacheTtlSec,
        cachePerPrincipal: t.cachePerPrincipal,
        sensitive: t.sensitive,
      })),
      total: tools.length,
    });
  });

  /** Enable a tool */
  app.put("/tools/:name/enable", async (c) => {
    const name = decodeURIComponent(c.req.param("name"));
    if (!toolRegistry.get(name)) return c.json({ error: "Tool not found" }, 404);
    await toolRegistry.setEnabled(name, true);
    return c.json({ tool: name, enabled: true });
  });

  /** Disable a tool */
  app.put("/tools/:name/disable", async (c) => {
    const name = decodeURIComponent(c.req.param("name"));
    if (!toolRegistry.get(name)) return c.json({ error: "Tool not found" }, 404);
    await toolRegistry.setEnabled(name, false);
    if (deps.cache) await deps.cache.invalidateTool(name);
    return c.json({ tool: name, enabled: false });
  });

  /** Set cache flags on a tool */
  app.patch("/tools/:name", async (c) => {
    const name = c.req.param("name");
    const existing = await deps.storage.tools.findByCanonicalName(name);
    if (!existing) return c.json({ error: { code: "not_found" } }, 404);
    const body = z.object({
      cacheable: z.boolean().optional(),
      cacheTtlSec: z.number().int().positive().nullable().optional(),
      cachePerPrincipal: z.boolean().optional(),
      sensitive: z.boolean().optional(),
    }).parse(await c.req.json());
    await deps.storage.tools.setCacheFlags(name, {
      cacheable: body.cacheable ?? existing.cacheable,
      cacheTtlSec: body.cacheTtlSec === undefined ? existing.cacheTtlSec : body.cacheTtlSec,
      cachePerPrincipal: body.cachePerPrincipal ?? existing.cachePerPrincipal,
    });
    if (body.sensitive !== undefined) {
      await deps.storage.tools.setSensitive(name, body.sensitive);
    }
    await deps.toolRegistry.load();
    if (existing.cacheable && body.cacheable === false && deps.cache) {
      await deps.cache.invalidateTool(name);
    }
    return c.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════
  // Tool Groups
  // ═══════════════════════════════════════════════════════

  /** List all groups */
  app.get("/groups", async (c) => {
    return c.json({ groups: toolGroups.list() });
  });

  /** Create a group */
  app.post("/groups", async (c) => {
    const body = await c.req.json() as {
      name: string;
      tools: string[];
      description?: string;
      allowedRoles?: string[];
      includedServers?: string[];
      excludedTools?: string[];
    };

    if (!body.name || !body.tools) {
      return c.json({ error: "name and tools are required" }, 400);
    }

    try {
      const group = await toolGroups.create(body.name, body.tools, {
        description: body.description,
        allowedRoles: body.allowedRoles,
      });

      // Apply includedServers/excludedTools if provided
      const includedServers = body.includedServers ?? [];
      const excludedTools = body.excludedTools ?? [];
      if (includedServers.length > 0 || excludedTools.length > 0) {
        await storage.groups.setIncludedServers(body.name, includedServers);
        await storage.groups.setExcludedTools(body.name, excludedTools);
        await toolGroups.load();
        const updated = toolGroups.get(body.name);
        return c.json({ group: updated }, 201);
      }

      return c.json({ group }, 201);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "Failed to create group" },
        400
      );
    }
  });

  /** Get group details */
  app.get("/groups/:name", async (c) => {
    const group = toolGroups.get(c.req.param("name"));
    if (!group) return c.json({ error: "Group not found" }, 404);

    // resolveTools() filters to enabled tools only — preserve previous semantics
    // by returning the full list of canonical tool names declared on the group.
    return c.json({ group, resolvedTools: group.tools });
  });

  // ── Group mutation endpoints ─────────────────────────

  /** Update a group — accepts tools, includedServers, excludedTools, allowedRoles, description, enabled */
  app.patch("/groups/:name", async (c) => {
    const name = c.req.param("name");
    if (!toolGroups.get(name)) return c.json({ error: "Group not found" }, 404);

    const body = await c.req.json() as {
      tools?: string[];
      includedServers?: string[];
      excludedTools?: string[];
      allowedRoles?: string[];
      description?: string;
      enabled?: boolean;
      proxyName?: string | null;
    };

    if (body.tools !== undefined) {
      await storage.groups.setTools(name, body.tools);
    }
    if (body.includedServers !== undefined) {
      await storage.groups.setIncludedServers(name, body.includedServers);
    }
    if (body.excludedTools !== undefined) {
      await storage.groups.setExcludedTools(name, body.excludedTools);
    }
    if (body.proxyName !== undefined) {
      await storage.groups.setProxyName(name, body.proxyName);
    }

    await toolGroups.load();
    const updated = toolGroups.get(name);
    return c.json({ group: updated });
  });

  /** Update a group (legacy PUT — redirects to PATCH behaviour) */
  app.put("/groups/:name", async (c) => {
    return c.json(
      {
        error: "Not implemented",
        detail:
          "Group update is deferred to P1. Use PATCH /groups/:name instead.",
      },
      501
    );
  });

  /** Delete a group */
  app.delete("/groups/:name", async (c) => {
    const name = c.req.param("name");
    if (!toolGroups.get(name)) return c.json({ error: "Group not found" }, 404);
    await toolGroups.delete(name);
    return c.json({ ok: true });
  });

  /** Add tool to group — not implemented in P0 */
  app.post("/groups/:name/tools", async (c) => {
    return c.json(
      {
        error: "Not implemented",
        detail:
          "Adding a tool to an existing group is deferred to P1. Recreate the group with the updated tool list.",
      },
      501
    );
  });

  /** Remove tool from group — not implemented in P0 */
  app.delete("/groups/:name/tools/:tool", async (c) => {
    return c.json(
      {
        error: "Not implemented",
        detail:
          "Removing a tool from an existing group is deferred to P1. Recreate the group with the updated tool list.",
      },
      501
    );
  });

  // ═══════════════════════════════════════════════════════
  // Policy Management (Casbin)
  // ═══════════════════════════════════════════════════════

  app.get("/policies", async (c) => {
    try {
      const policies = await listPolicies();
      return c.json({ policies });
    } catch {
      return c.json({ error: "Failed to list policies" }, 500);
    }
  });

  app.post("/policies", async (c) => {
    try {
      const { sub, obj, act } = await c.req.json();
      const added = await addPolicy(sub, obj, act);
      return c.json({ added });
    } catch (err) {
      log.warn({ err }, "addPolicy failed");
      return c.json({ error: "Failed to add policy" }, 500);
    }
  });

  app.delete("/policies", async (c) => {
    try {
      const { sub, obj, act } = await c.req.json();
      const removed = await removePolicy(sub, obj, act);
      return c.json({ removed });
    } catch (err) {
      log.warn({ err }, "removePolicy failed");
      return c.json({ error: "Failed to remove policy" }, 500);
    }
  });

  app.post("/policies/reload", async (c) => {
    try {
      await reloadPolicies();
      return c.json({ message: "Policies reloaded" });
    } catch {
      return c.json({ error: "Failed to reload policies" }, 500);
    }
  });

  app.get("/roles", async (c) => {
    try {
      const bindings = await listRoleBindings();
      return c.json({ bindings });
    } catch {
      return c.json({ error: "Failed to list role bindings" }, 500);
    }
  });

  app.post("/roles", async (c) => {
    try {
      const { user, role } = await c.req.json();
      const added = await addRoleForUser(user, role);
      return c.json({ added });
    } catch (err) {
      log.warn({ err }, "addRoleForUser failed");
      return c.json({ error: "Failed to add role" }, 500);
    }
  });

  app.delete("/roles", async (c) => {
    try {
      const { user, role } = await c.req.json();
      const removed = await removeRoleForUser(user, role);
      return c.json({ removed });
    } catch (err) {
      log.warn({ err }, "removeRoleForUser failed");
      return c.json({ error: "Failed to remove role" }, 500);
    }
  });

  // ═══════════════════════════════════════════════════════
  // MCP Client Management
  // ═══════════════════════════════════════════════════════

  app.route("/mcp-clients", createMcpClientsRoutes({ storage }));
  app.route("/users/me/tokens", createTokensRoutes({ storage }));
  app.route("/users", createUsersRoutes({ storage }));
  app.route("/prompts", createPromptsRoutes({ promptRegistry: deps.promptRegistry }));
  app.route("/usage", createUsageRoutes({ storage }));
  app.route("/system/info", createSystemInfoRoutes({ config }));

  if (deps.cache) {
    app.route("/cache", createCacheRoutes({ cache: deps.cache }));
  }

  return app;
}
