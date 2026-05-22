// ============================================================
// Circuit Breaker Admin Routes (P6, spec §5.2)
//
// Endpoints:
//   GET    /api/circuits                       list all circuits
//   GET    /api/circuits/config/defaults       global default config
//   PATCH  /api/circuits/config/defaults       partial update of defaults
//   GET    /api/circuits/:server               single + history
//   POST   /api/circuits/:server/trip          { reason }
//   POST   /api/circuits/:server/close         { reason }
//   POST   /api/circuits/:server/reset
//   PATCH  /api/circuits/:server/config        partial CircuitConfig
//
// Manual mutations (trip, close, reset, setEnabled) fire transition events
// on the underlying state machine, which the gateway's listener persists +
// re-emits via Prometheus + webhooks.
// ============================================================

import { Hono } from 'hono';
import { z } from 'zod';
import type { StorageAdapter } from '../../storage/adapter.js';
import type { StateMachine, CircuitConfig, ServerHealth } from '../../health/state-machine.js';

export interface CircuitsRoutesDeps {
  stateMachine: StateMachine;
  storage: StorageAdapter;
}

/**
 * JSON-safe public view of an in-memory ServerHealth. Strips fields that
 * are noisy / internal (lastTransitionAt is preserved; rolling is truncated
 * to last 100 records for the detail endpoint).
 */
function publicView(h: ServerHealth, opts: { history?: boolean } = {}) {
  const out: Record<string, unknown> = {
    serverName: h.serverName,
    state: h.state,
    config: h.config,
    consecutiveErrors: h.consecutiveErrors,
    totalCallsSinceRegister: h.totalCallsSinceRegister,
    openedAt: h.openedAt,
    halfOpenTestAt: h.halfOpenTestAt,
    reopenCount: h.reopenCount,
    lastTransitionAt: h.lastTransitionAt,
    lastTransitionReason: h.lastTransitionReason,
  };
  if (opts.history) {
    out.rolling = h.rolling.slice(-100);
  }
  return out;
}

const ConfigPatchSchema = z
  .object({
    errorRateThreshold: z.number().min(0).max(1).optional(),
    windowSize: z.number().int().positive().optional(),
    consecutiveErrorsToTrip: z.number().int().positive().optional(),
    cooldownMs: z.number().int().nonnegative().optional(),
    halfOpenProbes: z.number().int().positive().optional(),
    quarantineAfterReopens: z.number().int().positive().optional(),
    warmupCalls: z.number().int().nonnegative().optional(),
    probeMethod: z.string().min(1).optional(),
  })
  .strict();

export function createCircuitsRoutes(deps: CircuitsRoutesDeps) {
  const app = new Hono();
  const { stateMachine, storage } = deps;

  // GET /api/circuits — list all in-memory + persisted-only circuits
  app.get('/', async (c) => {
    const inMemory = new Map<string, ServerHealth>();
    for (const h of stateMachine.listAll()) inMemory.set(h.serverName, h);

    // Also surface persisted-only rows (e.g. server tracked in DB but not
    // yet re-touched after boot). For these we hydrate the in-memory entry
    // so subsequent calls hit the same object.
    try {
      const rows = await storage.serverStates.list();
      for (const r of rows) {
        if (!inMemory.has(r.serverName)) {
          stateMachine.restore(r.serverName, {
            state: r.state,
            rolling: r.rollingWindow,
            consecutiveErrors: r.consecutiveErrors,
            openedAt: r.openedAt ?? undefined,
            halfOpenTestAt: r.halfOpenTestAt ?? undefined,
            reopenCount: r.reopenCount,
            lastTransitionReason: r.lastTransitionReason ?? undefined,
            lastTransitionAt: r.updatedAt,
            config: (r.config as Record<string, never> | null) ?? undefined,
          });
          inMemory.set(r.serverName, stateMachine.getState(r.serverName));
        }
      }
    } catch { /* swallow — return whatever in-memory we have */ }

    return c.json({
      circuits: Array.from(inMemory.values()).map((h) => publicView(h)),
    });
  });

  // GET /api/circuits/config/defaults — current default config
  // Mounted BEFORE /:server so the literal path wins over the param route.
  app.get('/config/defaults', (c) => {
    return c.json({ defaults: stateMachine.getDefaults() });
  });

  app.patch('/config/defaults', async (c) => {
    let body: z.infer<typeof ConfigPatchSchema>;
    try {
      body = ConfigPatchSchema.parse(await c.req.json());
    } catch (err) {
      return c.json({ error: { code: 'invalid_body', detail: (err as Error).message } }, 400);
    }
    const next = stateMachine.setDefaults(body as Partial<CircuitConfig>);
    return c.json({ defaults: next });
  });

  // GET /api/circuits/:server
  app.get('/:server', (c) => {
    const server = c.req.param('server');
    const h = stateMachine.getState(server);
    return c.json({ circuit: publicView(h, { history: true }) });
  });

  // POST /api/circuits/:server/trip { reason? }
  app.post('/:server/trip', async (c) => {
    const server = c.req.param('server');
    let reason = 'manual trip';
    try {
      const body = await c.req.json().catch(() => ({})) as { reason?: string };
      if (body?.reason) reason = body.reason;
    } catch { /* default reason */ }
    stateMachine.trip(server, reason);
    return c.json({ ok: true, circuit: publicView(stateMachine.getState(server)) });
  });

  // POST /api/circuits/:server/close { reason? }
  app.post('/:server/close', async (c) => {
    const server = c.req.param('server');
    let reason = 'manual close';
    try {
      const body = await c.req.json().catch(() => ({})) as { reason?: string };
      if (body?.reason) reason = body.reason;
    } catch { /* default reason */ }
    stateMachine.close(server, reason);
    return c.json({ ok: true, circuit: publicView(stateMachine.getState(server)) });
  });

  // POST /api/circuits/:server/reset
  app.post('/:server/reset', (c) => {
    const server = c.req.param('server');
    stateMachine.reset(server);
    return c.json({ ok: true, circuit: publicView(stateMachine.getState(server)) });
  });

  // PATCH /api/circuits/:server/config
  app.patch('/:server/config', async (c) => {
    const server = c.req.param('server');
    let body: z.infer<typeof ConfigPatchSchema>;
    try {
      body = ConfigPatchSchema.parse(await c.req.json());
    } catch (err) {
      return c.json({ error: { code: 'invalid_body', detail: (err as Error).message } }, 400);
    }
    stateMachine.setConfig(server, body as Partial<CircuitConfig>);
    return c.json({ ok: true, circuit: publicView(stateMachine.getState(server)) });
  });

  // POST /api/circuits/:server/enabled { enabled: bool, reason? }
  app.post('/:server/enabled', async (c) => {
    const server = c.req.param('server');
    const body = z.object({ enabled: z.boolean(), reason: z.string().optional() }).parse(await c.req.json());
    stateMachine.setEnabled(server, body.enabled, body.reason);
    return c.json({ ok: true, circuit: publicView(stateMachine.getState(server)) });
  });

  return app;
}
