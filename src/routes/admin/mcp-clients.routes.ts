import { Hono } from 'hono';
import { z } from 'zod';
import type { StorageAdapter } from '../../storage/adapter.js';
import { newId } from '../../utils/uuid.js';
import { hashSecret } from '../../utils/crypto.js';
import { generateToken, computePrefix } from '../../identity/token.js';

export interface McpClientsRoutesDeps {
  storage: StorageAdapter;
}

export function createMcpClientsRoutes(deps: McpClientsRoutesDeps) {
  const app = new Hono();

  app.post('/', async (c) => {
    const body = z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      allowedServers: z.array(z.string()).default(['*']),
    }).parse(await c.req.json());

    const principalId = newId();
    await deps.storage.principals.createMCPClient({
      id: principalId,
      displayName: body.name,
      description: body.description,
      allowedServers: body.allowedServers,
    });
    const raw = generateToken('mct', 'live');
    const tokenId = newId();
    await deps.storage.tokens.create({
      id: tokenId, principalId,
      prefix: computePrefix(raw), hash: await hashSecret(raw),
      name: body.name,
    });
    return c.json({
      principalId,
      tokenId,
      token: raw,
      name: body.name,
      allowedServers: body.allowedServers,
    }, 201);
  });

  app.get('/', async (c) => {
    const rows = await deps.storage.transaction(async (tx) =>
      tx.query<{ id: string; display_name: string }>(
        `SELECT id, display_name FROM principals WHERE type = 'mcp_client' ORDER BY display_name`,
      ),
    );
    const clients = await Promise.all(rows.map(async (r) => {
      const p = await deps.storage.principals.findById(r.id);
      return p ? {
        principalId: p.id,
        name: p.displayName,
        description: p.description,
        allowedServers: p.allowedServers ?? [],
        disabled: p.disabled,
        createdAt: p.createdAt,
      } : null;
    }));
    return c.json({ clients: clients.filter(Boolean) });
  });

  app.get('/:id', async (c) => {
    const id = c.req.param('id');
    const p = await deps.storage.principals.findById(id);
    if (!p || p.type !== 'mcp_client') return c.json({ error: { code: 'not_found' } }, 404);
    return c.json({
      principalId: p.id,
      name: p.displayName,
      description: p.description,
      allowedServers: p.allowedServers ?? [],
      disabled: p.disabled,
      createdAt: p.createdAt,
    });
  });

  app.patch('/:id', async (c) => {
    const id = c.req.param('id');
    const p = await deps.storage.principals.findById(id);
    if (!p || p.type !== 'mcp_client') return c.json({ error: { code: 'not_found' } }, 404);

    const body = z.object({
      allowedServers: z.array(z.string()).optional(),
      disabled: z.boolean().optional(),
      description: z.string().optional(),
    }).parse(await c.req.json());

    if (body.allowedServers !== undefined) {
      await deps.storage.transaction(async (tx) => {
        await tx.execute('UPDATE mcp_clients SET allowed_servers = ? WHERE principal_id = ?',
          [JSON.stringify(body.allowedServers), id]);
      });
    }
    if (body.description !== undefined) {
      await deps.storage.transaction(async (tx) => {
        await tx.execute('UPDATE mcp_clients SET description = ? WHERE principal_id = ?',
          [body.description, id]);
      });
    }
    if (body.disabled !== undefined) {
      await deps.storage.principals.setDisabled(id, body.disabled);
    }
    return c.json({ ok: true });
  });

  app.delete('/:id', async (c) => {
    const id = c.req.param('id');
    const p = await deps.storage.principals.findById(id);
    if (!p || p.type !== 'mcp_client') return c.json({ error: { code: 'not_found' } }, 404);
    await deps.storage.transaction(async (tx) => {
      await tx.execute('DELETE FROM principals WHERE id = ?', [id]);
    });
    return c.json({ ok: true });
  });

  app.post('/:id/tokens/rotate', async (c) => {
    const id = c.req.param('id');
    const p = await deps.storage.principals.findById(id);
    if (!p || p.type !== 'mcp_client') return c.json({ error: { code: 'not_found' } }, 404);

    const existing = await deps.storage.tokens.listForPrincipal(id);
    for (const t of existing) {
      if (!t.revokedAt) await deps.storage.tokens.revoke(t.id);
    }

    const raw = generateToken('mct', 'live');
    const tokenId = newId();
    await deps.storage.tokens.create({
      id: tokenId, principalId: id,
      prefix: computePrefix(raw), hash: await hashSecret(raw),
      name: 'rotated',
    });
    return c.json({ tokenId, token: raw });
  });

  return app;
}
