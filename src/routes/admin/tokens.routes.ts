import { Hono } from 'hono';
import { z } from 'zod';
import type { StorageAdapter } from '../../storage/adapter.js';
import type { Principal } from '../../identity/principal.js';
import type { GatewayVariables } from '../../middleware/types.js';
import { newId } from '../../utils/uuid.js';
import { hashSecret } from '../../utils/crypto.js';
import { generateToken, computePrefix } from '../../identity/token.js';

export interface TokensRoutesDeps {
  storage: StorageAdapter;
}

export function createTokensRoutes(deps: TokensRoutesDeps) {
  const app = new Hono<{ Variables: GatewayVariables }>();

  app.use('*', async (c, next) => {
    const principal = c.get('principal') as Principal | undefined;
    if (!principal || principal.type !== 'user') {
      return c.json({ error: { code: 'forbidden', message: 'Only users can manage PATs' } }, 403);
    }
    return next();
  });

  app.post('/', async (c) => {
    const principal = c.get('principal') as Principal;
    const body = z.object({
      name: z.string().min(1),
      expiresInDays: z.number().int().positive().optional(),
    }).parse(await c.req.json());

    const raw = generateToken('pat', 'live');
    const tokenId = newId();
    const expiresAt = body.expiresInDays
      ? Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000
      : undefined;
    await deps.storage.tokens.create({
      id: tokenId, principalId: principal.id,
      prefix: computePrefix(raw), hash: await hashSecret(raw),
      name: body.name, expiresAt,
    });
    return c.json({ tokenId, token: raw, name: body.name, expiresAt }, 201);
  });

  app.get('/', async (c) => {
    const principal = c.get('principal') as Principal;
    const tokens = await deps.storage.tokens.listForPrincipal(principal.id);
    return c.json({
      tokens: tokens.filter((t) => !t.revokedAt).map((t) => ({
        id: t.id, prefix: t.prefix, name: t.name,
        createdAt: t.createdAt, lastUsedAt: t.lastUsedAt, expiresAt: t.expiresAt,
      })),
    });
  });

  app.delete('/:id', async (c) => {
    const principal = c.get('principal') as Principal;
    const id = c.req.param('id');
    const list = await deps.storage.tokens.listForPrincipal(principal.id);
    const owned = list.find((t) => t.id === id);
    if (!owned) return c.json({ error: { code: 'not_found' } }, 404);
    await deps.storage.tokens.revoke(id);
    return c.json({ ok: true });
  });

  return app;
}
