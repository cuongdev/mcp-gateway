import { test, expect, loginAsAdmin } from './support/fixtures';

// Resources are auto-discovered via MCP resources/list when a server is
// registered (and re-discovered on POST /servers/:name/sync). The mock MCP
// upstream (web/tests/e2e/support/mock-mcp.mjs) serves a distinct resource set
// per tool path (/fs → hosts + app.log, /db → users schema, /gh → README.md)
// and answers resources/read with text payloads, so registering a server
// populates the left panel and lets the right panel render content.

test('Resources page heading, description, and search input are visible', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/resources');
  await expect(page.getByRole('heading', { name: 'Resources' })).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByText('MCP resources discovered from upstream servers. Read text, JSON, or media payloads.'),
  ).toBeVisible();
  await expect(page.getByPlaceholder(/Search by URI/i)).toBeVisible();
});

test('Resources left panel shows empty state on fresh gateway', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/resources');
  await expect(page.getByRole('heading', { name: 'Resources' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('No resources')).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText(/Resources are auto-discovered/i)).toBeVisible();
});

test('Resources right panel shows "Select a resource" placeholder on fresh gateway', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/resources');
  await expect(page.getByRole('heading', { name: 'Resources' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Select a resource')).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText(/Pick a URI from the list/i)).toBeVisible();
});

test('Resources page lists discovered resources and reads content', async ({ page, api }) => {
  const server = await api.createServer({ path: '/fs' });

  await loginAsAdmin(page, '/dashboard/resources');
  await expect(page.getByRole('heading', { name: 'Resources' })).toBeVisible({ timeout: 10_000 });

  // Left panel: server card + both /fs resources by name.
  await expect(page.getByText(server.name, { exact: true })).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText('hosts', { exact: true })).toBeVisible();
  await expect(page.getByText('app.log', { exact: true })).toBeVisible();

  // Click a resource → right panel proxies resources/read and renders the text.
  await page.getByText('hosts', { exact: true }).click();
  await expect(page.getByText('127.0.0.1 localhost')).toBeVisible({ timeout: 8_000 });

  // Right-panel header exposes the enabled switch for the selected resource.
  await expect(page.getByRole('switch')).toBeVisible();
});

test('Resources search filters the discovered list by URI', async ({ page, api }) => {
  await api.createServer({ path: '/fs' });

  await loginAsAdmin(page, '/dashboard/resources');
  await expect(page.getByRole('heading', { name: 'Resources' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('hosts', { exact: true })).toBeVisible({ timeout: 8_000 });

  const search = page.getByPlaceholder(/Search by URI/i);
  await search.fill('app.log');           // matches file:///var/log/app.log only
  await expect(page.getByText('app.log', { exact: true })).toBeVisible();
  await expect(page.getByText('hosts', { exact: true })).toHaveCount(0);

  await search.fill('');                   // clearing restores the full list
  await expect(page.getByText('hosts', { exact: true })).toBeVisible();
});
