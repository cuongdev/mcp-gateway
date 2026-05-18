// ============================================================
// Admin Approvals Routes (/api/approvals)
//
// REST surface for approvers:
//   GET    /api/approvals?status=pending
//   GET    /api/approvals/:id
//   POST   /api/approvals/:id/approve  { reason? }
//   POST   /api/approvals/:id/reject   { reason? }
// ============================================================

import { Hono } from 'hono';
import { z } from 'zod';
import type { ApprovalService } from '../../approval/index.js';
import type { Principal } from '../../identity/principal.js';
import type { GatewayVariables } from '../../middleware/types.js';

export interface ApprovalsRoutesDeps {
  approvalService: ApprovalService;
}

export function createApprovalsRoutes(deps: ApprovalsRoutesDeps) {
  const app = new Hono<{ Variables: GatewayVariables }>();

  app.get('/', async (c) => {
    const status = c.req.query('status') ?? 'pending';
    if (status === 'pending') {
      return c.json({ approvals: await deps.approvalService.listPending() });
    }
    return c.json(
      { error: { code: 'unsupported_filter', message: 'Only status=pending supported (P3 scope)' } },
      400,
    );
  });

  app.get('/:id', async (c) => {
    const a = await deps.approvalService.get(c.req.param('id'));
    if (!a) return c.json({ error: { code: 'not_found' } }, 404);
    return c.json(a);
  });

  app.post('/:id/approve', async (c) => {
    const principal = c.get('principal') as Principal | undefined;
    if (!principal) return c.json({ error: { code: 'unauthenticated' } }, 401);
    const body = z
      .object({ reason: z.string().optional() })
      .parse(await c.req.json().catch(() => ({})));
    const ok = await deps.approvalService.approve(c.req.param('id'), principal.id, body.reason);
    if (!ok) return c.json({ error: { code: 'conflict', message: 'Not pending' } }, 409);
    return c.json({ ok: true });
  });

  app.post('/:id/reject', async (c) => {
    const principal = c.get('principal') as Principal | undefined;
    if (!principal) return c.json({ error: { code: 'unauthenticated' } }, 401);
    const body = z
      .object({ reason: z.string().optional() })
      .parse(await c.req.json().catch(() => ({})));
    const ok = await deps.approvalService.reject(c.req.param('id'), principal.id, body.reason);
    if (!ok) return c.json({ error: { code: 'conflict', message: 'Not pending' } }, 409);
    return c.json({ ok: true });
  });

  return app;
}
