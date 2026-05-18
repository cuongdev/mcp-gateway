// ============================================================
// Approval Gate Middleware
//
// Intercepts `tools/call` requests for sensitive tools and
// returns a 202 `approval_required` JSON-RPC error containing
// the approval id and poll URL. When the caller replays the
// request with `X-MCP-Approval-Id` matching an approved
// approval for the same tool, the request is passed through to
// the downstream MCP handler.
// ============================================================

import type { MiddlewareHandler } from 'hono';
import type { ApprovalService } from '../../approval/index.js';
import type { ToolRegistry } from '../../registry/tool.registry.js';
import type { GatewayVariables } from '../types.js';

export interface ApprovalGateOptions {
  approvalService: ApprovalService;
  toolRegistry: ToolRegistry;
}

export function approvalGateMiddleware(opts: ApprovalGateOptions): MiddlewareHandler<{ Variables: GatewayVariables }> {
  return async (c, next) => {
    const ctype = c.req.header('content-type') ?? '';
    if (!ctype.includes('application/json')) return next();

    let body: { method?: string; id?: unknown; params?: { name?: string; arguments?: unknown } };
    try {
      body = (await c.req.raw.clone().json()) as typeof body;
    } catch {
      return next();
    }

    if (body.method !== 'tools/call' || typeof body.params?.name !== 'string') {
      return next();
    }

    const tool = opts.toolRegistry.get(body.params.name);
    if (!tool || !tool.sensitive) return next();

    const principal = c.get('principal');
    if (!principal) return next();

    // Execution path: post-approval replay carries X-MCP-Approval-Id.
    const approvalId = c.req.header('x-mcp-approval-id');
    if (approvalId) {
      const approval = await opts.approvalService.get(approvalId);
      if (approval && approval.status === 'approved' && approval.tool === body.params.name) {
        return next();
      }
    }

    const approval = await opts.approvalService.request({
      principalId: principal.id,
      tool: body.params.name,
      args: body.params.arguments,
    });

    return c.json(
      {
        jsonrpc: '2.0',
        id: 'id' in body ? (body as { id?: unknown }).id : null,
        error: {
          code: -32001,
          message: 'approval_required',
          data: { approval_id: approval.id, poll_url: `/api/approvals/${approval.id}` },
        },
      },
      202,
    );
  };
}
