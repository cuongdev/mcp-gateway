import { Hono } from "hono";
import type { GatewayVariables } from "../../middleware/types.js";
import type { CapabilityRegistry } from "../../capability/registry.js";
import type { CapabilityKind } from "../../capability/types.js";

interface Deps {
  capabilityRegistry: CapabilityRegistry;
}

const VALID_KINDS: CapabilityKind[] = ['tool', 'resource', 'prompt', 'root'];

function isKind(s: string): s is CapabilityKind {
  return (VALID_KINDS as string[]).includes(s);
}

/**
 * Unified capability admin view (v0.9 — CapabilityRegistry adoption).
 *
 *   GET /                        list all (filterable by ?kind=, ?server=, ?enabled=)
 *   GET /counts                  per-kind counts
 *
 * The MCP routes still consume the per-kind registries directly for routing
 * decisions (a `tools/call` needs to resolve a Tool, not a generic Capability).
 * This admin surface exists so operators have ONE place to inspect every
 * capability the gateway exposes — across tools, prompts, resources, roots,
 * AND virtual tools (in a future iteration).
 */
export function createCapabilitiesRoutes(deps: Deps) {
  const app = new Hono<{ Variables: GatewayVariables }>();
  const { capabilityRegistry } = deps;

  app.get("/", async (c) => {
    const kindParam = c.req.query("kind");
    const serverName = c.req.query("server") || c.req.query("serverName");
    const enabledParam = c.req.query("enabled");

    const filter: { kind?: CapabilityKind; serverName?: string; enabledOnly?: boolean } = {};
    if (kindParam && isKind(kindParam)) filter.kind = kindParam;
    if (serverName) filter.serverName = serverName;
    if (enabledParam === 'true') filter.enabledOnly = true;

    const capabilities = capabilityRegistry.list(filter);
    return c.json({
      capabilities: capabilities.map((cap) => ({
        canonicalName: cap.canonicalName,
        kind: cap.kind,
        serverName: cap.serverName,
        enabled: cap.enabled,
        sensitive: cap.sensitive,
        tenantId: cap.tenantId,
        // kind-specific fields included if present
        ...('description' in cap ? { description: cap.description } : {}),
        ...('uri' in cap ? { uri: cap.uri } : {}),
        ...('name' in cap ? { name: cap.name } : {}),
        ...('mimeType' in cap ? { mimeType: cap.mimeType } : {}),
      })),
    });
  });

  app.get("/counts", async (c) => {
    const all = capabilityRegistry.list();
    const counts: Record<string, number> = { tool: 0, prompt: 0, resource: 0, root: 0 };
    for (const c of all) counts[c.kind] = (counts[c.kind] ?? 0) + 1;
    return c.json({ counts, total: all.length });
  });

  return app;
}
