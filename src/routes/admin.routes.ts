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
import type { GatewayVariables } from "../middleware/types.js";
import type { GatewayConfig } from "../config/schema.js";
import type { ToolRegistry } from "../registry/tool.registry.js";
import type { ToolGroupManager } from "../registry/tool.groups.js";
import type { SessionManager, TransportConfig } from "../session/session.manager.js";
import { performHealthCheck } from "../middleware/monitoring/health.js";
import { getMetrics } from "../middleware/monitoring/metrics.middleware.js";
import {
  listPolicies,
  reloadPolicies,
  addPolicy,
  removePolicy,
  addRoleForUser,
} from "../middleware/authz/policy.engine.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ component: "admin-api" });

interface AdminRouteDeps {
  config: GatewayConfig;
  toolRegistry: ToolRegistry;
  toolGroups: ToolGroupManager;
  sessionManager: SessionManager;
}

/**
 * Build the admin/developer REST API routes.
 */
export function createAdminRoutes(deps: AdminRouteDeps) {
  const app = new Hono<{ Variables: GatewayVariables }>();
  const { config, toolRegistry, toolGroups, sessionManager } = deps;

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
    const servers = toolRegistry.listServers();
    const details = servers.map((name) => ({
      name,
      tools: toolRegistry.listServerTools(name).map((t) => t.name),
      session: sessionManager.has(name),
    }));
    return c.json({ servers: details });
  });

  /** Register a new MCP server */
  app.post("/servers", async (c) => {
    const body = await c.req.json() as {
      name: string;
      transport: TransportConfig;
    };

    if (!body.name || !body.transport) {
      return c.json({ error: "name and transport are required" }, 400);
    }

    // Register session
    sessionManager.register(body.name, body.transport);

    // Discover tools from the server (initialize handshake + tools/list)
    try {
      const tools = await sessionManager.discoverTools(body.name);
      toolRegistry.registerServerTools(body.name, tools);

      log.info(
        { server: body.name, toolCount: tools.length },
        "Server registered and tools discovered"
      );

      return c.json({
        server: body.name,
        tools: tools.map((t: any) => toolRegistry.toCanonical(body.name, t.name)),
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
    toolRegistry.removeServerTools(name);
    sessionManager.remove(name);
    log.info({ server: name }, "Server deregistered");
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
      toolRegistry.registerServerTools(name, tools);

      return c.json({
        server: name,
        tools: tools.map((t: any) => toolRegistry.toCanonical(name, t.name)),
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
      })),
      total: tools.length,
    });
  });

  /** Enable a tool */
  app.put("/tools/:name/enable", async (c) => {
    const name = decodeURIComponent(c.req.param("name"));
    const ok = toolRegistry.setEnabled(name, true);
    if (!ok) return c.json({ error: "Tool not found" }, 404);
    return c.json({ tool: name, enabled: true });
  });

  /** Disable a tool */
  app.put("/tools/:name/disable", async (c) => {
    const name = decodeURIComponent(c.req.param("name"));
    const ok = toolRegistry.setEnabled(name, false);
    if (!ok) return c.json({ error: "Tool not found" }, 404);
    return c.json({ tool: name, enabled: false });
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
    };

    if (!body.name || !body.tools) {
      return c.json({ error: "name and tools are required" }, 400);
    }

    try {
      const group = toolGroups.create(body.name, body.tools, {
        description: body.description,
        allowedRoles: body.allowedRoles,
      });
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

    const tools = toolGroups.listGroupTools(group.name);
    return c.json({ group, resolvedTools: tools });
  });

  /** Update a group */
  app.put("/groups/:name", async (c) => {
    const body = await c.req.json();
    const updated = toolGroups.update(c.req.param("name"), body);
    if (!updated) return c.json({ error: "Group not found" }, 404);
    return c.json({ group: updated });
  });

  /** Delete a group */
  app.delete("/groups/:name", async (c) => {
    const ok = toolGroups.delete(c.req.param("name"));
    if (!ok) return c.json({ error: "Group not found" }, 404);
    return c.json({ ok: true });
  });

  /** Add tool to group */
  app.post("/groups/:name/tools", async (c) => {
    const { tool } = await c.req.json() as { tool: string };
    const ok = toolGroups.addTool(c.req.param("name"), tool);
    if (!ok) return c.json({ error: "Group not found" }, 404);
    return c.json({ ok: true });
  });

  /** Remove tool from group */
  app.delete("/groups/:name/tools/:tool", async (c) => {
    const ok = toolGroups.removeTool(
      c.req.param("name"),
      decodeURIComponent(c.req.param("tool"))
    );
    if (!ok) return c.json({ error: "Group or tool not found" }, 404);
    return c.json({ ok: true });
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
    const { sub, obj, act } = await c.req.json();
    const added = await addPolicy(sub, obj, act);
    return c.json({ added });
  });

  app.delete("/policies", async (c) => {
    const { sub, obj, act } = await c.req.json();
    const removed = await removePolicy(sub, obj, act);
    return c.json({ removed });
  });

  app.post("/policies/reload", async (c) => {
    try {
      await reloadPolicies();
      return c.json({ message: "Policies reloaded" });
    } catch {
      return c.json({ error: "Failed to reload policies" }, 500);
    }
  });

  app.post("/roles", async (c) => {
    const { user, role } = await c.req.json();
    const added = await addRoleForUser(user, role);
    return c.json({ added });
  });

  return app;
}
