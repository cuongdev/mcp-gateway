import { type APIRequestContext, type Playwright } from '@playwright/test';

/**
 * Admin API client used to seed and tear down data for "with-data" E2E tests.
 *
 * It authenticates once via POST /auth/dev-login (dev mode issues a session
 * cookie for the stable "dev" principal — the same identity the UI login uses,
 * so seeded data is visible to the browser session). Every create() registers
 * a cleanup thunk; cleanup() runs them LIFO so dependants are removed before
 * their dependencies. This keeps the shared sqlite empty between tests, so the
 * existing empty-state smoke specs continue to pass.
 */

let seq = 0;
/** Collision-proof suffix for seeded entity names. */
export function uid(prefix = 'e2e'): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

/** URL of the mock MCP upstream tool set (/fs | /db | /gh). */
export function mockUpstream(path: '/fs' | '/db' | '/gh' = '/fs'): string {
  const port = process.env.MOCK_MCP_PORT ?? '8900';
  return `http://localhost:${port}${path}`;
}

export interface SeedApi {
  ctx: APIRequestContext;
  get<T = unknown>(path: string): Promise<T>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
  patch<T = unknown>(path: string, body?: unknown): Promise<T>;
  put<T = unknown>(path: string, body?: unknown): Promise<T>;
  del(path: string): Promise<void>;

  createUser(over?: Partial<{ email: string; displayName: string }>): Promise<{ id: string; email: string; displayName: string }>;
  createGroup(over?: Partial<{ name: string; description: string; tools: string[] }>): Promise<{ name: string }>;
  createMcpClient(over?: Partial<{ name: string; description: string; allowedServers: string[] }>): Promise<{ id: string; name: string }>;
  createMyToken(over?: Partial<{ name: string; expiresInDays: number }>): Promise<{ tokenId: string; token: string; name: string }>;
  createTenant(over?: Partial<{ slug: string; displayName: string; plan: string }>): Promise<{ id: string; slug: string; displayName: string }>;
  createWebhook(over?: Partial<{ name: string; url: string; events: string[]; secret: string }>): Promise<{ id: string; name: string }>;
  createRedactionRule(over?: Partial<{ name: string; kind: string; pattern: string; mode: string }>): Promise<{ id: string; name: string }>;
  createVirtualTool(over?: Partial<{ name: string; description: string }>): Promise<{ name: string }>;
  /** Registers an MCP server pointed at the mock upstream and waits for tool discovery. */
  createServer(over?: Partial<{ name: string; path: '/fs' | '/db' | '/gh' }>): Promise<{ name: string }>;
  addPolicy(p: { sub: string; obj: string; act: string }): Promise<void>;

  /** Manually register a teardown action (LIFO). */
  onCleanup(fn: () => Promise<void>): void;
  cleanup(): Promise<void>;
}

export async function createSeedApi(playwright: Playwright, baseURL: string): Promise<SeedApi> {
  const ctx = await playwright.request.newContext({ baseURL });
  // Best-effort: in dev mode (NODE_ENV=test) the gateway auto-injects an
  // anonymous service_account principal and leaves the admin API open
  // (requireAuthForApi=false), so seeding works without a session cookie.
  // dev-login itself 500s in pure dev mode (no auth.sessionCookieSecret
  // default), which is harmless here — we never depend on the cookie.
  await ctx.post('/auth/dev-login').catch(() => undefined);

  const cleanups: Array<() => Promise<void>> = [];

  async function call<T>(method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string, body?: unknown): Promise<T> {
    const res = await ctx[method](path, body === undefined ? undefined : { data: body });
    if (!res.ok()) {
      const text = await res.text().catch(() => '');
      throw new Error(`${method.toUpperCase()} ${path} → ${res.status()} ${text}`);
    }
    if (res.status() === 204) return undefined as T;
    return (await res.json().catch(() => undefined)) as T;
  }

  const api: SeedApi = {
    ctx,
    get: (p) => call('get', p),
    post: (p, b) => call('post', p, b),
    patch: (p, b) => call('patch', p, b),
    put: (p, b) => call('put', p, b),
    del: async (p) => { await call('delete', p); },
    onCleanup: (fn) => cleanups.push(fn),

    async createUser(over = {}) {
      const email = over.email ?? `${uid('user')}@example.com`;
      const displayName = over.displayName ?? `Seed User ${seq}`;
      const u = await call<{ principalId: string }>('post', '/api/users', { email, displayName });
      cleanups.push(async () => { await ctx.delete(`/api/users/${encodeURIComponent(u.principalId)}?hard=true`); });
      return { id: u.principalId, email, displayName };
    },

    async createGroup(over = {}) {
      const name = over.name ?? uid('group');
      await call('post', '/api/groups', {
        name,
        description: over.description ?? 'seeded group',
        tools: over.tools ?? [],
      });
      cleanups.push(async () => { await ctx.delete(`/api/groups/${encodeURIComponent(name)}`); });
      return { name };
    },

    async createMcpClient(over = {}) {
      const name = over.name ?? uid('client');
      const c = await call<{ principalId: string }>('post', '/api/mcp-clients', {
        name,
        description: over.description ?? 'seeded client',
        allowedServers: over.allowedServers ?? [],
      });
      cleanups.push(async () => { await ctx.delete(`/api/mcp-clients/${encodeURIComponent(c.principalId)}`); });
      return { id: c.principalId, name };
    },

    async createMyToken(over = {}) {
      const name = over.name ?? uid('token');
      const t = await call<{ tokenId: string; token: string }>('post', '/api/users/me/tokens', {
        name,
        ...(over.expiresInDays ? { expiresInDays: over.expiresInDays } : {}),
      });
      cleanups.push(async () => { await ctx.delete(`/api/users/me/tokens/${encodeURIComponent(t.tokenId)}`); });
      return { tokenId: t.tokenId, token: t.token, name };
    },

    async createTenant(over = {}) {
      const slug = over.slug ?? uid('tenant');
      const displayName = over.displayName ?? `Seed Tenant ${seq}`;
      const t = await call<{ id: string }>('post', '/api/system/tenants', {
        slug,
        displayName,
        plan: over.plan ?? 'free',
      });
      cleanups.push(async () => { await ctx.delete(`/api/system/tenants/${encodeURIComponent(t.id)}`); });
      return { id: t.id, slug, displayName };
    },

    async createWebhook(over = {}) {
      const name = over.name ?? uid('webhook');
      const w = await call<{ id: string }>('post', '/api/webhooks', {
        name,
        url: over.url ?? 'https://example.com/hook',
        events: over.events ?? ['tool.call'],
        ...(over.secret ? { secret: over.secret } : {}),
      });
      cleanups.push(async () => { await ctx.delete(`/api/webhooks/${encodeURIComponent(w.id)}`); });
      return { id: w.id, name };
    },

    async createRedactionRule(over = {}) {
      const name = over.name ?? uid('rule');
      const r = await call<{ rule: { id: string } }>('post', '/api/redaction/rules', {
        name,
        kind: over.kind ?? 'regex',
        pattern: over.pattern ?? 'secret-\\d+',
        mode: over.mode ?? 'mask',
      });
      const id = r.rule.id;
      cleanups.push(async () => { await ctx.delete(`/api/redaction/rules/${encodeURIComponent(id)}`); });
      return { id, name };
    },

    async createVirtualTool(over = {}) {
      const name = over.name ?? uid('vtool');
      const plan = {
        name,
        description: over.description ?? 'seeded virtual tool',
        steps: [{ type: 'constant', output: { ok: true } }],
      };
      await call('post', '/api/virtual-tools', plan);
      cleanups.push(async () => { await ctx.delete(`/api/virtual-tools/${encodeURIComponent(name)}`); });
      return { name };
    },

    async createServer(over = {}) {
      const name = over.name ?? uid('server');
      await call('post', '/api/servers', {
        name,
        transport: { type: 'streamable-http', url: mockUpstream(over.path ?? '/fs'), timeout: 30000 },
      });
      cleanups.push(async () => { await ctx.delete(`/api/servers/${encodeURIComponent(name)}`); });
      // Discovery is synchronous on register, but give the tool sync a beat.
      await call('post', `/api/servers/${encodeURIComponent(name)}/sync`).catch(() => undefined);
      return { name };
    },

    async addPolicy(p) {
      await call('post', '/api/policies', p);
      cleanups.push(async () => {
        await ctx.delete('/api/policies', { data: p }).catch(() => undefined);
      });
    },

    async cleanup() {
      for (const fn of cleanups.reverse()) {
        await fn().catch(() => undefined);
      }
      cleanups.length = 0;
    },
  };

  return api;
}
