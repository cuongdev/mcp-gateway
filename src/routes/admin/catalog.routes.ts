// ============================================================
// Connector Catalog Admin Routes (P9, spec §8.5)
//
// Endpoints:
//   GET    /api/catalog/connectors        — list templates
//   GET    /api/catalog/connectors/:id    — single template
//   POST   /api/catalog/install           — install a connector
//   GET    /api/catalog/installs          — list installs + update flag
//   POST   /api/catalog/installs/:id/update  — re-install (deferred, 501)
//   DELETE /api/catalog/installs/:id      — uninstall by install id
// ============================================================

import { Hono } from 'hono';
import { z } from 'zod';
import type { ConnectorRegistry } from '../../catalog/connectors.js';
import type { CatalogInstaller } from '../../catalog/installer.js';
import type { StorageAdapter } from '../../storage/adapter.js';
import type { ConnectorCategory, ConnectorSupports } from '../../catalog/types.js';
import { GatewayError } from '../../types/errors.js';
import type { GatewayVariables } from '../../middleware/types.js';

export interface CatalogRoutesDeps {
  registry: ConnectorRegistry;
  installer: CatalogInstaller;
  storage: StorageAdapter;
}

const CATEGORIES: ConnectorCategory[] = [
  'developer-tools', 'databases', 'productivity', 'cloud',
  'ai-ml', 'communications', 'local',
];

const SUPPORTS_KEYS = ['tools', 'resources', 'prompts', 'sampling', 'roots'] as const;

const InstallBodySchema = z.object({
  connectorId: z.string().min(1),
  name: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase alphanumeric/hyphen'),
  env: z.record(z.string()),
  args: z.record(z.string()).optional(),
  options: z
    .object({
      autoDiscover: z.boolean().optional(),
      enableCircuitBreaker: z.boolean().optional(),
      applyRedaction: z.boolean().optional(),
      proxyName: z.string().nullable().optional(),
    })
    .optional(),
});

export function createCatalogRoutes(deps: CatalogRoutesDeps) {
  const app = new Hono<{ Variables: GatewayVariables }>();

  // GET /connectors — list templates with optional filters
  app.get('/connectors', async (c) => {
    const category = c.req.query('category') as ConnectorCategory | undefined;
    const supports = c.req.query('supports') as keyof ConnectorSupports | undefined;
    if (category && !CATEGORIES.includes(category)) {
      return c.json({ error: { code: 'invalid_category', category } }, 400);
    }
    if (supports && !SUPPORTS_KEYS.includes(supports as never)) {
      return c.json({ error: { code: 'invalid_supports', supports } }, 400);
    }
    const list = category || supports
      ? deps.registry.filter({ category, supports })
      : deps.registry.list();
    return c.json({ connectors: list });
  });

  // GET /connectors/:id — single template
  app.get('/connectors/:id', async (c) => {
    const tpl = deps.registry.get(c.req.param('id'));
    if (!tpl) return c.json({ error: { code: 'not_found' } }, 404);
    return c.json(tpl);
  });

  // POST /install — install a connector
  app.post('/install', async (c) => {
    let body: z.infer<typeof InstallBodySchema>;
    try {
      body = InstallBodySchema.parse(await c.req.json());
    } catch (err) {
      return c.json({ error: { code: 'invalid_request', detail: (err as Error).message } }, 400);
    }

    // Pull caller principal id from middleware context if available.
    const principal = c.get('principal') as { id?: string } | undefined;
    try {
      const result = await deps.installer.install({
        connectorId: body.connectorId,
        name: body.name,
        env: body.env,
        args: body.args,
        options: body.options,
        installedBy: principal?.id ?? null,
      });
      return c.json(result, 201);
    } catch (err) {
      if (err instanceof GatewayError) {
        return c.json(err.toJSON(), err.statusCode as never);
      }
      throw err;
    }
  });

  // GET /installs — list installs (with updateAvailable flag)
  app.get('/installs', async (c) => {
    const installs = await deps.installer.listInstalls();
    return c.json({ installs });
  });

  // POST /installs/:id/update — re-install using current template version + fresh env.
  // Body: { env: Record<string,string>, args?: Record<string,unknown>, options?: InstallOptions }
  // Secret env values MUST be re-supplied (the stored config snapshot redacts them).
  app.post('/installs/:id/update', async (c) => {
    const id = c.req.param('id');
    const install = await deps.storage.catalogInstalls.findById(id);
    if (!install) return c.json({ error: { code: 'not_found' } }, 404);

    const template = deps.registry.get(install.connectorId);
    if (!template) {
      return c.json(
        { error: { code: 'connector_removed', detail: `Connector '${install.connectorId}' is no longer in the catalog` } },
        409,
      );
    }

    let body: { env?: Record<string, string>; args?: Record<string, string>; options?: Record<string, unknown> } = {};
    try { body = await c.req.json(); } catch { /* empty body is OK if no required secrets */ }

    // Validate every secret-flagged required-env key has a fresh value (the snapshot redacted them).
    const missingSecrets = template.requiredEnv
      .filter((e) => e.secret)
      .filter((e) => !body.env || !body.env[e.key] || body.env[e.key].trim().length === 0)
      .map((e) => e.key);
    if (missingSecrets.length > 0) {
      return c.json(
        {
          error: {
            code: 'missing_secrets',
            detail: 'Re-install requires fresh values for secret env vars (stored snapshot redacts them).',
            missing: missingSecrets,
          },
        },
        400,
      );
    }

    const serverName = install.serverName;
    // Best-effort atomic swap: uninstall then install. Between the two steps
    // the server is offline; we keep the window short. CatalogInstaller.install
    // already rolls back on failure.
    try {
      await deps.installer.uninstall(serverName);
    } catch (_err) {
      // If uninstall fails (e.g. session already gone), continue — install will
      // recreate the server row.
    }

    try {
      const result = await deps.installer.install({
        connectorId: install.connectorId,
        name: serverName,
        env: body.env ?? {},
        args: body.args,
        options: body.options as never,
        installedBy: install.installedBy ?? null,
        tenantId: install.tenantId,
      });
      return c.json({
        ok: true,
        result,
        previousVersion: install.templateVersion,
        currentVersion: template.templateVersion,
      });
    } catch (err) {
      if (err instanceof GatewayError) {
        return c.json({ error: { code: err.code, detail: err.message } }, err.statusCode as never);
      }
      throw err;
    }
  });

  // DELETE /installs/:id — uninstall
  app.delete('/installs/:id', async (c) => {
    const id = c.req.param('id');
    const install = await deps.storage.catalogInstalls.findById(id);
    if (!install) return c.json({ error: { code: 'not_found' } }, 404);
    try {
      await deps.installer.uninstall(install.serverName);
      return c.json({ ok: true });
    } catch (err) {
      if (err instanceof GatewayError) {
        return c.json(err.toJSON(), err.statusCode as never);
      }
      throw err;
    }
  });

  return app;
}
