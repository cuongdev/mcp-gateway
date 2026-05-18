import { Hono } from 'hono';
import type { PromptRegistry } from '../../registry/prompt.registry.js';

export interface PromptsRoutesDeps {
  promptRegistry: PromptRegistry;
}

export function createPromptsRoutes(deps: PromptsRoutesDeps) {
  const app = new Hono();

  app.get('/', (c) => {
    const enabledOnly = c.req.query('enabled') === 'true';
    const prompts = enabledOnly ? deps.promptRegistry.list() : deps.promptRegistry.listAll();
    return c.json({
      prompts: prompts.map((p) => ({
        canonicalName: p.canonicalName,
        serverName: p.serverName,
        originalName: p.originalName,
        description: p.description,
        argumentsSchema: p.argumentsSchema,
        enabled: p.enabled,
      })),
    });
  });

  app.put('/:name/enable', async (c) => {
    const name = c.req.param('name');
    if (!deps.promptRegistry.get(name)) return c.json({ error: { code: 'not_found' } }, 404);
    await deps.promptRegistry.setEnabled(name, true);
    return c.json({ ok: true });
  });

  app.put('/:name/disable', async (c) => {
    const name = c.req.param('name');
    if (!deps.promptRegistry.get(name)) return c.json({ error: { code: 'not_found' } }, 404);
    await deps.promptRegistry.setEnabled(name, false);
    return c.json({ ok: true });
  });

  return app;
}
