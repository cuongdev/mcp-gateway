import { test, expect, loginAsAdmin } from '../support/fixtures';

// Capture real, populated screenshots of every dashboard screen for docs/wiki/.
// Seeds a representative dataset once, then walks each route. Run via:
//   npx playwright test -c playwright.shots.config.ts --project=shots-dashboard
// PNGs land in ../docs/wiki/images/.

const OUT = '../docs/wiki/images';

const ROUTES: Array<[path: string, file: string]> = [
  ['/dashboard/overview', 'overview'],
  ['/dashboard/catalog', 'catalog'],
  ['/dashboard/servers', 'servers'],
  ['/dashboard/tools', 'tools'],
  ['/dashboard/groups', 'groups'],
  ['/dashboard/resources', 'resources'],
  ['/dashboard/virtual-tools', 'virtual-tools'],
  ['/dashboard/prompts', 'prompts'],
  ['/dashboard/proxies', 'proxies'],
  ['/dashboard/users', 'users'],
  ['/dashboard/mcp-clients', 'mcp-clients'],
  ['/dashboard/policies', 'policies'],
  ['/dashboard/circuits', 'circuits'],
  ['/dashboard/rate-limit', 'rate-limit'],
  ['/dashboard/quota', 'quota'],
  ['/dashboard/cache', 'cache'],
  ['/dashboard/approvals', 'approvals'],
  ['/dashboard/redaction', 'redaction'],
  ['/dashboard/usage', 'usage'],
  ['/dashboard/audit', 'audit'],
  ['/dashboard/sampling-log', 'sampling-log'],
  ['/dashboard/metrics', 'metrics'],
  ['/dashboard/health', 'health'],
  ['/dashboard/tenants', 'tenants'],
  ['/dashboard/webhooks', 'webhooks'],
  ['/dashboard/settings', 'settings'],
];

test('capture dashboard screenshots', async ({ page, api }) => {
  test.setTimeout(120_000);

  // ── Seed a representative dataset so screens render populated ──
  await api.createServer({ name: 'filesystem', path: '/fs' }).catch(() => undefined);
  await api.createServer({ name: 'database', path: '/db' }).catch(() => undefined);
  await api.createGroup({ name: 'data-analyst', description: 'Read-only data tools', tools: ['database__query_data', 'filesystem__read_file'] }).catch(() => undefined);
  await api.createUser({ displayName: 'Alice Engineer', email: 'alice@example.com' }).catch(() => undefined);
  await api.createMcpClient({ name: 'ci-bot', description: 'CI automation client' }).catch(() => undefined);
  await api.addPolicy({ sub: 'analyst', obj: 'data-analyst', act: 'use' }).catch(() => undefined);
  await api.createRedactionRule({ name: 'email-pii', kind: 'regex', pattern: '[a-z0-9._%+-]+@[a-z0-9.-]+', mode: 'mask' }).catch(() => undefined);
  await api.createWebhook({ name: 'slack-alerts', url: 'https://hooks.example.com/svc', events: ['tool.call', 'server.health'] }).catch(() => undefined);
  await api.createTenant({ slug: 'acme', displayName: 'Acme Corp', plan: 'pro' }).catch(() => undefined);
  await api.createVirtualTool({ name: 'fetch_and_summarize', description: 'Read a file then summarize it' }).catch(() => undefined);
  await api.post('/api/proxies', { name: 'corp-egress', url: 'http://proxy.internal:3128', kind: 'http' }).catch(() => undefined);

  // Prime the dev session, then capture each screen.
  await loginAsAdmin(page, '/dashboard/overview');

  for (const [route, file] of ROUTES) {
    await page.goto(route);
    // Let the page's primary heading mount, then settle network/animation.
    await page.locator('h1').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${file}.png`, fullPage: true });
  }

  expect(ROUTES.length).toBeGreaterThan(0);
});
