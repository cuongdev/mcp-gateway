import { Hono } from "hono";
import type { GatewayVariables } from "../../middleware/types.js";
import type { StorageAdapter } from "../../storage/adapter.js";
import type { SamplingOutcome } from "../../storage/repositories/sampling-log.repo.js";

interface Deps {
  storage: StorageAdapter;
}

/**
 * Admin REST surface for the sampling log (P8 reverse-channel audit).
 *
 * Endpoints:
 *   GET /            list recent sampling/roots attempts (filterable)
 *   GET /stats       aggregates over since-window (default 24h)
 */
export function createSamplingLogRoutes(deps: Deps) {
  const app = new Hono<{ Variables: GatewayVariables }>();
  const { storage } = deps;

  app.get("/", async (c) => {
    const q = c.req.query();
    const filter = {
      since: q.since ? Number(q.since) : undefined,
      serverName: q.serverName || q.server || undefined,
      outcome: (q.outcome as SamplingOutcome | undefined) || undefined,
      method: q.method || undefined,
      principalId: q.principalId || undefined,
      limit: q.limit ? Math.min(Number(q.limit), 500) : 200,
    };
    const rows = await storage.samplingLog.list(filter);
    return c.json({ entries: rows });
  });

  app.get("/stats", async (c) => {
    const sinceParam = c.req.query("since");
    const since = sinceParam ? Number(sinceParam) : Date.now() - 24 * 3600 * 1000;
    const stats = await storage.samplingLog.stats(since);
    return c.json({ since, ...stats });
  });

  return app;
}
