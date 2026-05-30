import { test, expect, loginAsAdmin } from './support/fixtures';

// Prompts are auto-discovered via the MCP prompts/list protocol when a server
// is registered. The mock MCP upstream (web/tests/e2e/support/mock-mcp.mjs)
// only handles tools/list — it does NOT implement prompts/list, so it returns
// an empty prompts array after server registration.
//
// Limitation: we cannot reach the populated card state with the current mock.
// These tests exercise what is reachable:
//   • empty-state UI with no servers registered
//   • heading and description text
//   • empty-state persists even after a server is registered (mock has no prompts)
//
// When the mock is extended to serve prompts/list, add a seeded populated-state
// test mirroring the servers.data.spec.ts pattern (seed server → assert prompt
// card with server name + enable/disable switch).

test('Prompts page heading and description are visible', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/prompts');
  await expect(page.getByRole('heading', { name: 'Prompts' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Server-defined prompts discovered via MCP prompts/list')).toBeVisible();
});

test('Prompts empty state is shown on a fresh gateway', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/prompts');
  await expect(page.getByRole('heading', { name: 'Prompts' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('No prompts discovered')).toBeVisible();
  await expect(page.getByText(/Prompts are auto-discovered/i)).toBeVisible();
});

test('Prompts page remains on empty state when a server is registered (mock exposes no prompts)', async ({ page, api }) => {
  // Register a server — the mock responds to initialize + tools/list only.
  await api.createServer({ path: '/fs' });

  await loginAsAdmin(page, '/dashboard/prompts');
  await expect(page.getByRole('heading', { name: 'Prompts' })).toBeVisible({ timeout: 10_000 });
  // Mock serves no prompts, so the empty state must still be visible.
  await expect(page.getByText('No prompts discovered')).toBeVisible({ timeout: 8_000 });
});
