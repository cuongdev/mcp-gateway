import { Hono } from "hono";
import { z } from "zod";
import type { GatewayVariables } from "../../middleware/types.js";
import type { ResourceRegistry } from "../../registry/resource.registry.js";
import type { SessionManager } from "../../session/session.manager.js";
import { MCP_METHODS } from "../../types/mcp.js";

interface Deps {
  resourceRegistry: ResourceRegistry;
  sessionManager: SessionManager;
}

/**
 * Admin REST surface for MCP resources.
 *
 * Endpoints:
 *   GET    /                     list all discovered resources
 *   GET    /:canonical           single resource metadata
 *   POST   /:canonical/read      proxy read via owning upstream + admin auth
 *   PUT    /:canonical/enable    enable
 *   PUT    /:canonical/disable   disable
 */
export function createResourcesRoutes(deps: Deps) {
  const app = new Hono<{ Variables: GatewayVariables }>();
  const { resourceRegistry, sessionManager } = deps;

  app.get("/", async (c) => {
    const resources = resourceRegistry.list().map((r) => ({
      canonicalName: r.canonicalName,
      serverName: r.serverName,
      uri: r.uri,
      name: r.name,
      description: r.description,
      mimeType: r.mimeType ?? null,
      enabled: r.enabled,
      sensitive: r.sensitive,
    }));
    return c.json({ resources });
  });

  app.get("/templates", async (c) => {
    const templates = resourceRegistry.listTemplates().map((t) => ({
      id: t.id,
      serverName: t.serverName,
      uriTemplate: t.uriTemplate,
      name: t.name,
      description: t.description,
      mimeType: t.mimeType,
    }));
    return c.json({ templates });
  });

  app.get("/:canonical", async (c) => {
    const canonical = decodeURIComponent(c.req.param("canonical"));
    const r = resourceRegistry.get(canonical);
    if (!r) return c.json({ error: { code: "NOT_FOUND", message: "Resource not found" } }, 404);
    return c.json({
      resource: {
        canonicalName: r.canonicalName,
        serverName: r.serverName,
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType ?? null,
        enabled: r.enabled,
        sensitive: r.sensitive,
      },
    });
  });

  app.post("/:canonical/read", async (c) => {
    const canonical = decodeURIComponent(c.req.param("canonical"));
    const r = resourceRegistry.get(canonical);
    if (!r) return c.json({ error: { code: "NOT_FOUND", message: "Resource not found" } }, 404);
    if (!r.enabled) return c.json({ error: { code: "DISABLED", message: "Resource is disabled" } }, 403);
    try {
      const response = await sessionManager.send(r.serverName, {
        jsonrpc: "2.0",
        id: `admin-read-${Date.now()}`,
        method: MCP_METHODS.RESOURCES_READ,
        params: { uri: r.uri },
      });
      // Unwrap JSON-RPC envelope; pass result body through
      type RpcResult = { result?: { contents?: unknown } };
      const rpc = response as RpcResult;
      const contents = rpc.result?.contents ?? [];
      return c.json({ contents });
    } catch (err) {
      return c.json({ error: { code: "UPSTREAM_ERROR", message: (err as Error).message } }, 502);
    }
  });

  app.put("/:canonical/enable", async (c) => {
    const canonical = decodeURIComponent(c.req.param("canonical"));
    if (!resourceRegistry.get(canonical)) {
      return c.json({ error: { code: "NOT_FOUND", message: "Resource not found" } }, 404);
    }
    await resourceRegistry.setEnabled(canonical, true);
    return c.json({ ok: true });
  });

  app.put("/:canonical/disable", async (c) => {
    const canonical = decodeURIComponent(c.req.param("canonical"));
    if (!resourceRegistry.get(canonical)) {
      return c.json({ error: { code: "NOT_FOUND", message: "Resource not found" } }, 404);
    }
    await resourceRegistry.setEnabled(canonical, false);
    return c.json({ ok: true });
  });

  const sensitiveBody = z.object({ sensitive: z.boolean() });
  app.patch("/:canonical", async (c) => {
    const canonical = decodeURIComponent(c.req.param("canonical"));
    const body = sensitiveBody.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: { code: "INVALID_BODY", message: body.error.message } }, 400);
    if (!resourceRegistry.get(canonical)) {
      return c.json({ error: { code: "NOT_FOUND", message: "Resource not found" } }, 404);
    }
    await resourceRegistry.setSensitive(canonical, body.data.sensitive);
    return c.json({ ok: true });
  });

  return app;
}
