import { Hono } from 'hono';
import { z } from 'zod';
import type { StorageAdapter } from '../../storage/adapter.js';
import { newId } from '../../utils/uuid.js';

export interface UsersRoutesDeps {
  storage: StorageAdapter;
}

export function createUsersRoutes(deps: UsersRoutesDeps) {
  const app = new Hono();

  app.post('/', async (c) => {
    const body = z.object({
      email: z.string().email(),
      displayName: z.string().min(1),
    }).parse(await c.req.json());

    const existing = await deps.storage.transaction(async (tx) =>
      tx.queryOne<{ principal_id: string }>(
        'SELECT principal_id FROM users WHERE email = ?', [body.email]
      ),
    );
    if (existing) return c.json({ error: { code: 'conflict', message: 'Email already exists' } }, 409);

    const principalId = newId();
    await deps.storage.principals.createUser({
      id: principalId, email: body.email, displayName: body.displayName,
    });
    return c.json({ principalId, email: body.email, displayName: body.displayName }, 201);
  });

  app.get('/', async (c) => {
    const rows = await deps.storage.transaction(async (tx) =>
      tx.query<{ id: string }>(
        `SELECT id FROM principals WHERE type = 'user' ORDER BY display_name`
      ),
    );
    const users = [];
    for (const r of rows) {
      const p = await deps.storage.principals.findById(r.id);
      if (p) users.push({
        principalId: p.id,
        email: p.email,
        displayName: p.displayName,
        disabled: p.disabled,
        createdAt: p.createdAt,
      });
    }
    return c.json({ users });
  });

  app.get('/:id', async (c) => {
    const p = await deps.storage.principals.findById(c.req.param('id'));
    if (!p || p.type !== 'user') return c.json({ error: { code: 'not_found' } }, 404);
    return c.json({
      principalId: p.id, email: p.email, displayName: p.displayName,
      disabled: p.disabled, createdAt: p.createdAt,
    });
  });

  app.patch('/:id', async (c) => {
    const id = c.req.param('id');
    const p = await deps.storage.principals.findById(id);
    if (!p || p.type !== 'user') return c.json({ error: { code: 'not_found' } }, 404);
    const body = z.object({
      disabled: z.boolean().optional(),
    }).parse(await c.req.json());
    if (body.disabled !== undefined) {
      await deps.storage.principals.setDisabled(id, body.disabled);
    }
    return c.json({ ok: true });
  });

  app.delete('/:id', async (c) => {
    const id = c.req.param('id');
    const hard = c.req.query('hard') === 'true';
    const p = await deps.storage.principals.findById(id);
    if (!p || p.type !== 'user') return c.json({ error: { code: 'not_found' } }, 404);
    if (hard) {
      await deps.storage.transaction(async (tx) => {
        await tx.execute('DELETE FROM principals WHERE id = ?', [id]);
      });
    } else {
      await deps.storage.principals.setDisabled(id, true);
    }
    return c.json({ ok: true });
  });

  return app;
}
