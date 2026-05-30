import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './support/auth';

// Sidebar navigation coverage — clicking every visible nav item must route
// correctly and render a page (h1) without crashing. Previously only 1 of the
// links was exercised (via the command palette in overview.smoke).
//
// The dev principal is an admin service_account, so admin-gated items show but
// "My Tokens" (gated type === 'user') is hidden and intentionally omitted.
// Reliability/Security/Observability/System groups are collapsed by default and
// must be expanded first.

const COLLAPSED_GROUPS = ['Reliability', 'Security', 'Observability', 'System'];

const NAV: Array<{ label: string; path: string }> = [
  { label: 'Catalog', path: '/dashboard/catalog' },
  { label: 'Servers', path: '/dashboard/servers' },
  { label: 'Tools', path: '/dashboard/tools' },
  { label: 'Tool Groups', path: '/dashboard/groups' },
  { label: 'Resources', path: '/dashboard/resources' },
  { label: 'Virtual Tools', path: '/dashboard/virtual-tools' },
  { label: 'Prompts', path: '/dashboard/prompts' },
  { label: 'Proxies', path: '/dashboard/proxies' },
  { label: 'Users', path: '/dashboard/users' },
  { label: 'MCP Clients', path: '/dashboard/mcp-clients' },
  { label: 'OIDC Providers', path: '/dashboard/oidc' },
  { label: 'Policies', path: '/dashboard/policies' },
  { label: 'Circuits', path: '/dashboard/circuits' },
  { label: 'Rate Limit', path: '/dashboard/rate-limit' },
  { label: 'Quota', path: '/dashboard/quota' },
  { label: 'Cache', path: '/dashboard/cache' },
  { label: 'Approvals', path: '/dashboard/approvals' },
  { label: 'Redaction', path: '/dashboard/redaction' },
  { label: 'Usage', path: '/dashboard/usage' },
  { label: 'Audit', path: '/dashboard/audit' },
  { label: 'Sampling Log', path: '/dashboard/sampling-log' },
  { label: 'Metrics', path: '/dashboard/metrics' },
  { label: 'Health', path: '/dashboard/health' },
  { label: 'Tenants', path: '/dashboard/tenants' },
  { label: 'Webhooks', path: '/dashboard/webhooks' },
  { label: 'Settings', path: '/dashboard/settings' },
];

test('every sidebar link routes to its page', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/overview');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible({ timeout: 10_000 });

  const sidebar = page.getByRole('navigation');
  // Expand collapsed groups so all links are reachable.
  for (const group of COLLAPSED_GROUPS) {
    await sidebar.getByRole('button', { name: new RegExp(group) }).click();
  }

  for (const { label, path } of NAV) {
    await sidebar.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(path.replace(/\//g, '\\/')));
    // Page rendered an h1 (didn't crash into the suspense fallback / error).
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 10_000 });
  }
});
