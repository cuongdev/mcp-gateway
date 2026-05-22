// ============================================================
// /api/virtual-tools — admin CRUD + validate/dry-run (P10).
//
// All routes assume the storage VirtualToolRepo + executor have
// been wired by gateway.ts. Plans are validated against
// validatePlan() before persistence — the validator is the
// security boundary for template-expression injection.
// ============================================================

import { Hono } from 'hono';
import type { VirtualToolRepo, VirtualToolRow } from '../../storage/repositories/virtual-tool.repo.js';
import type { VirtualToolExecutor } from '../../virtual-tools/executor.js';
import { validatePlan } from '../../virtual-tools/plan-schema.js';
import type { VirtualToolPlan } from '../../virtual-tools/types.js';

export interface VirtualToolsRoutesDeps {
  repo: VirtualToolRepo;
  executor: VirtualToolExecutor;
}

function toJson(row: VirtualToolRow) {
  return {
    canonicalName: row.canonicalName,
    description: row.description,
    inputSchema: safeParse(row.inputSchemaJson),
    plan: safeParse(row.planJson),
    errorPolicy: row.errorPolicy,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    tenantId: row.tenantId,
  };
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

export function createVirtualToolsRoutes(deps: VirtualToolsRoutesDeps) {
  const app = new Hono();
  const { repo, executor } = deps;

  // GET /api/virtual-tools
  app.get('/', async (c) => {
    const rows = await repo.list();
    return c.json({ virtualTools: rows.map(toJson) });
  });

  // POST /api/virtual-tools — body is the full plan
  app.post('/', async (c) => {
    const body = await c.req.json().catch(() => null) as unknown;
    if (!body || typeof body !== 'object') {
      return c.json({ error: { code: 'invalid_body', message: 'expected plan object' } }, 400);
    }
    const v = validatePlan(body);
    if (!v.ok) return c.json({ error: { code: 'invalid_plan', errors: v.errors } }, 400);

    const plan = v.plan;
    const existing = await repo.findByName(plan.name);
    if (existing) return c.json({ error: { code: 'exists', message: `virtual tool '${plan.name}' already exists` } }, 409);

    const principal = c.get('principal' as never) as { id?: string } | undefined;
    const row = await repo.create({
      canonicalName: plan.name,
      description: plan.description,
      inputSchemaJson: JSON.stringify(plan.inputSchema),
      planJson: JSON.stringify(plan),
      errorPolicy: plan.errorPolicy,
      createdBy: principal?.id ?? null,
    });
    return c.json(toJson(row), 201);
  });

  // GET /api/virtual-tools/:name
  app.get('/:name', async (c) => {
    const name = c.req.param('name');
    const row = await repo.findByName(name);
    if (!row) return c.json({ error: { code: 'not_found' } }, 404);
    return c.json(toJson(row));
  });

  // PATCH /api/virtual-tools/:name — update plan + metadata
  app.patch('/:name', async (c) => {
    const name = c.req.param('name');
    const existing = await repo.findByName(name);
    if (!existing) return c.json({ error: { code: 'not_found' } }, 404);
    const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return c.json({ error: { code: 'invalid_body' } }, 400);
    }

    const patch: Parameters<VirtualToolRepo['update']>[1] = {};
    if (body.plan !== undefined) {
      const v = validatePlan(body.plan);
      if (!v.ok) return c.json({ error: { code: 'invalid_plan', errors: v.errors } }, 400);
      patch.planJson = JSON.stringify(v.plan);
      patch.inputSchemaJson = JSON.stringify(v.plan.inputSchema);
      patch.errorPolicy = v.plan.errorPolicy;
      if (typeof v.plan.description === 'string') patch.description = v.plan.description;
    }
    if (typeof body.description === 'string' || body.description === null) {
      patch.description = body.description as string | null;
    }
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;

    const row = await repo.update(name, patch);
    return c.json(toJson(row!));
  });

  // DELETE /api/virtual-tools/:name
  app.delete('/:name', async (c) => {
    const name = c.req.param('name');
    const existing = await repo.findByName(name);
    if (!existing) return c.json({ error: { code: 'not_found' } }, 404);
    await repo.delete(name);
    return c.json({ ok: true });
  });

  // POST /api/virtual-tools/validate — body { plan }
  app.post('/validate', async (c) => {
    const body = await c.req.json().catch(() => null) as { plan?: unknown } | null;
    if (!body || body.plan === undefined) {
      return c.json({ error: { code: 'invalid_body', message: 'expected { plan }' } }, 400);
    }
    const v = validatePlan(body.plan);
    if (v.ok) return c.json({ ok: true });
    return c.json({ ok: false, errors: v.errors });
  });

  // POST /api/virtual-tools/:name/test — body { args }
  app.post('/:name/test', async (c) => {
    const name = c.req.param('name');
    const row = await repo.findByName(name);
    if (!row) return c.json({ error: { code: 'not_found' } }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { args?: unknown };
    const plan = safeParse(row.planJson) as VirtualToolPlan | null;
    if (!plan) return c.json({ error: { code: 'corrupt_plan' } }, 500);
    try {
      const report = await executor.dryRun(plan, body.args ?? {});
      return c.json(report);
    } catch (err) {
      return c.json({ error: { code: 'execute_failed', message: (err as Error)?.message ?? String(err) } }, 500);
    }
  });

  return app;
}
