import { test, expect, loginAsAdmin } from './support/fixtures';

// Resources are auto-discovered via MCP resources/list when a server is
// registered or synced. The mock MCP upstream
// (web/tests/e2e/support/mock-mcp.mjs) does NOT implement resources/list
// (only tools/list), so registering a server yields zero resources.
//
// Limitation: we cannot reach the populated tree state with the current mock.
// These tests cover the reachable UI:
//   • heading, description, search input visible
//   • left-panel empty state and right-panel placeholder are shown
//   • empty state persists after registering a server (mock has no resources)
//
// When the mock is extended with resources/list, add a seeded test that:
//   1. api.createServer({ path: '/fs' })
//   2. navigates to /dashboard/resources
//   3. asserts the server card appears in the left panel
//   4. clicks a resource URI to load content in the right panel
//   5. asserts the enabled Switch is visible in the right panel header

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

test('Resources search input is interactive (does not crash the page)', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/resources');
  await expect(page.getByRole('heading', { name: 'Resources' })).toBeVisible({ timeout: 10_000 });

  const search = page.getByPlaceholder(/Search by URI/i);
  await search.fill('file://');
  // No crash — empty state still visible because there are no resources to filter.
  await expect(page.getByText('No resources')).toBeVisible({ timeout: 5_000 });

  // Clear — empty state persists.
  await search.fill('');
  await expect(page.getByText('No resources')).toBeVisible({ timeout: 5_000 });
});

test('Resources page remains on empty state when a server is registered (mock exposes no resources)', async ({ page, api }) => {
  // Register a server — the mock responds to initialize + tools/list only.
  await api.createServer({ path: '/db' });

  await loginAsAdmin(page, '/dashboard/resources');
  await expect(page.getByRole('heading', { name: 'Resources' })).toBeVisible({ timeout: 10_000 });
  // Mock serves no resources — left panel must remain on empty state.
  await expect(page.getByText('No resources')).toBeVisible({ timeout: 8_000 });
});
