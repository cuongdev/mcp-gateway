import type { MiddlewareHandler } from 'hono';

export function mcpClientAllowlistMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const principal = c.get('principal');
    if (!principal || principal.type !== 'mcp_client') return next();

    const ctype = c.req.header('content-type') ?? '';
    if (!ctype.includes('application/json')) return next();

    let body: { method?: string; params?: { name?: string } } = {};
    try {
      // Clone the raw request so the downstream handler can re-read the body
      body = await c.req.raw.clone().json() as { method?: string; params?: { name?: string } };
    } catch {
      return next();
    }

    if (body.method !== 'tools/call' || typeof body.params?.name !== 'string') {
      return next();
    }

    const allowed = principal.allowedServers ?? [];
    if (allowed.includes('*')) return next();

    const [serverName] = body.params.name.split('__');
    if (allowed.includes(serverName)) return next();

    return c.json(
      { error: { code: 'server_not_allowed', message: `Server '${serverName}' not in client allowedServers` } },
      403,
    );
  };
}
