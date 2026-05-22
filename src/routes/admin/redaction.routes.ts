// ============================================================
// Redaction Admin Routes (P7) — /api/redaction
//
//   GET    /rules                — list redaction rules
//   POST   /rules                — create a custom rule
//   GET    /rules/:id            — get one rule
//   PATCH  /rules/:id            — update rule (mode-only on built-in)
//   DELETE /rules/:id            — delete (custom only)
//   POST   /test                 — test scan a piece of text
//   GET    /findings             — recent findings
//   GET    /stats                — aggregate stats by rule / server
// ============================================================

import { Hono } from 'hono';
import { z } from 'zod';
import type { StorageAdapter } from '../../storage/adapter.js';
import { RedactionEngine, compileRules } from '../../redaction/engine.js';
import type { RawRule } from '../../redaction/types.js';
import type { RedactionEngineFactory } from '../../redaction/factory.js';
import { isSafeRegex } from '../../redaction/safe-regex-validator.js';
import { newId } from '../../utils/uuid.js';

export interface RedactionRoutesDeps {
  storage: StorageAdapter;
  engineFactory: RedactionEngineFactory;
}

export function createRedactionRoutes(deps: RedactionRoutesDeps) {
  const app = new Hono();

  // ── Rules ────────────────────────────────────────────
  app.get('/rules', async (c) => {
    const builtIn = c.req.query('builtIn');
    const enabled = c.req.query('enabled');
    const rules = await deps.storage.redactionRules.list({
      builtIn: builtIn == null ? undefined : builtIn === 'true',
      enabled: enabled == null ? undefined : enabled === 'true',
    });
    return c.json({ rules });
  });

  app.post('/rules', async (c) => {
    const body = z.object({
      name: z.string().min(1),
      kind: z.string().min(1),
      pattern: z.string().min(1),
      mode: z.enum(['redact', 'block', 'warn']).default('redact'),
      replacement: z.string().nullable().optional(),
      priority: z.number().int().min(0).max(10_000).optional(),
      scopeRequest: z.boolean().optional(),
      scopeResponse: z.boolean().optional(),
      enabled: z.boolean().optional(),
    }).parse(await c.req.json());

    if (!isSafeRegex(body.pattern)) {
      return c.json({ error: { code: 'unsafe_pattern', message: 'Pattern failed safe-regex check (potential ReDoS)' } }, 400);
    }
    try {
      new RegExp(body.pattern);
    } catch (err) {
      return c.json({ error: { code: 'invalid_pattern', message: (err as Error).message } }, 400);
    }

    const existing = await deps.storage.redactionRules.findByName(body.name);
    if (existing) return c.json({ error: { code: 'conflict', message: 'rule name exists' } }, 409);

    const id = `rrl_${newId().slice(4)}`;
    const row = await deps.storage.redactionRules.create({
      id, ...body, builtIn: false,
      replacement: body.replacement ?? null,
    });
    deps.engineFactory.invalidate();
    return c.json(row, 201);
  });

  app.get('/rules/:id', async (c) => {
    const row = await deps.storage.redactionRules.findById(c.req.param('id'));
    if (!row) return c.json({ error: { code: 'not_found' } }, 404);
    return c.json(row);
  });

  app.patch('/rules/:id', async (c) => {
    const id = c.req.param('id');
    const existing = await deps.storage.redactionRules.findById(id);
    if (!existing) return c.json({ error: { code: 'not_found' } }, 404);

    const body = z.object({
      mode: z.enum(['redact', 'block', 'warn']).optional(),
      replacement: z.string().nullable().optional(),
      enabled: z.boolean().optional(),
      priority: z.number().int().min(0).max(10_000).optional(),
      scopeRequest: z.boolean().optional(),
      scopeResponse: z.boolean().optional(),
      pattern: z.string().optional(),
      name: z.string().optional(),
    }).parse(await c.req.json());

    if (existing.builtIn) {
      // For built-ins: only allow mode + enabled changes.
      const allowed = ['mode', 'enabled'] as const;
      for (const k of Object.keys(body)) {
        if (!allowed.includes(k as never)) {
          return c.json({ error: { code: 'forbidden', message: `Cannot change '${k}' on built-in rule (mode/enabled only)` } }, 403);
        }
      }
    } else {
      if (body.pattern !== undefined && !isSafeRegex(body.pattern)) {
        return c.json({ error: { code: 'unsafe_pattern' } }, 400);
      }
    }
    await deps.storage.redactionRules.update(id, body);
    deps.engineFactory.invalidate();
    return c.json({ ok: true });
  });

  app.delete('/rules/:id', async (c) => {
    const id = c.req.param('id');
    const existing = await deps.storage.redactionRules.findById(id);
    if (!existing) return c.json({ error: { code: 'not_found' } }, 404);
    if (existing.builtIn) {
      return c.json({ error: { code: 'forbidden', message: 'Cannot delete built-in rule; disable instead' } }, 403);
    }
    await deps.storage.redactionRules.delete(id);
    deps.engineFactory.invalidate();
    return c.json({ ok: true });
  });

  // ── Test playground ──────────────────────────────────
  app.post('/test', async (c) => {
    const body = z.object({
      text: z.string(),
      ruleIds: z.array(z.string()).optional(),
      scope: z.enum(['request', 'response']).default('request'),
    }).parse(await c.req.json());

    const rows = body.ruleIds
      ? (await deps.storage.redactionRules.list()).filter((r) => body.ruleIds!.includes(r.id))
      : (await deps.storage.redactionRules.list({ enabled: true }));

    const raw: RawRule[] = rows.map((r) => ({
      id: r.id, name: r.name, kind: r.kind, pattern: r.pattern,
      // For test playground: force block→warn so the test never throws.
      mode: r.mode === 'block' ? 'warn' : r.mode,
      replacement: r.replacement ?? undefined,
      scopeRequest: r.scopeRequest, scopeResponse: r.scopeResponse, enabled: true,
    }));
    const engine = new RedactionEngine(compileRules(raw));
    const result = engine.scan(body.text, body.scope);
    return c.json({ redacted: result.value, findings: result.findings });
  });

  // ── Findings ─────────────────────────────────────────
  app.get('/findings', async (c) => {
    const q = c.req.query.bind(c.req);
    const sinceParam = q('since');
    const limit = q('limit') ? Math.min(parseInt(q('limit')!, 10), 1000) : 100;
    const rows = await deps.storage.redactionFindings.list({
      since: sinceParam ? parseSince(sinceParam) : undefined,
      ruleId: q('ruleId') || undefined,
      serverName: q('server') || undefined,
      scope: (q('scope') as 'request' | 'response' | undefined) || undefined,
      mode: (q('mode') as 'redact' | 'block' | 'warn' | undefined) || undefined,
      principalId: q('principal') || undefined,
      limit,
    });
    return c.json({ findings: rows });
  });

  // ── Stats ────────────────────────────────────────────
  app.get('/stats', async (c) => {
    const sinceParam = c.req.query('since') ?? '24h';
    const since = parseSince(sinceParam);
    const [byRule, byServer] = await Promise.all([
      deps.storage.redactionFindings.statsByRule(since),
      deps.storage.redactionFindings.statsByServer(since),
    ]);
    return c.json({ since, byRule, byServer });
  });

  return app;
}

/**
 * Parse a duration string like "1h", "24h", "7d", "30m" into an epoch ms cutoff.
 * Falls back to Date.parse for ISO strings. Defaults to 24h.
 */
function parseSince(s: string): number {
  const m = /^(\d+)([smhd])$/.exec(s);
  if (m) {
    const n = parseInt(m[1], 10);
    const unit = m[2];
    const ms = unit === 's' ? n * 1000
      : unit === 'm' ? n * 60_000
      : unit === 'h' ? n * 3_600_000
      : n * 86_400_000;
    return Date.now() - ms;
  }
  const ts = Date.parse(s);
  if (!Number.isNaN(ts)) return ts;
  return Date.now() - 24 * 3_600_000;
}
