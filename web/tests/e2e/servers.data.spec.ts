import { test, expect, loginAsAdmin } from './support/fixtures';

// "With-data" coverage for Servers & Tools using the mock MCP upstream.
// Registering a server discovers its tool set, so this exercises the populated
// table state the empty-state smoke specs can't reach.

test('a registered server appears in the servers table', async ({ page, api }) => {
  const { name } = await api.createServer({ path: '/fs' });
  await loginAsAdmin(page, '/dashboard/servers');
  await expect(page.getByRole('heading', { name: 'Servers' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('No servers registered')).toBeHidden();
  await expect(page.getByRole('main').getByText(name)).toBeVisible();
});

test('discovered tools from the upstream show on the Tools page', async ({ page, api }) => {
  await api.createServer({ path: '/fs' });
  await loginAsAdmin(page, '/dashboard/tools');
  await expect(page.getByRole('heading', { name: 'Tools' })).toBeVisible({ timeout: 10_000 });
  // /fs upstream exposes read_file/write_file/list_directory/search_files.
  await expect(page.getByText(/read_file/).first()).toBeVisible({ timeout: 10_000 });
});
