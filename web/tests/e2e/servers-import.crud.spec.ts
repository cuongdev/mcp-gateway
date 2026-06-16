import { test, expect, loginAsAdmin } from './support/fixtures';
import { mockUpstream, uid } from './support/api';

// Import MCP servers from a pasted client config (Claude/Cursor/VS Code/…
// shape). Points the imported server at the mock upstream so discovery works.
test('import an MCP server from a pasted client config', async ({ page, api }) => {
  const name = uid('imp');
  api.onCleanup(async () => { await api.del(`/api/servers/${encodeURIComponent(name)}`).catch(() => undefined); });

  const config = JSON.stringify({ mcpServers: { [name]: { url: mockUpstream('/fs') } } }, null, 2);

  await loginAsAdmin(page, '/dashboard/servers');
  await page.getByRole('button', { name: 'Import' }).click();
  await expect(page.getByRole('heading', { name: 'Import MCP servers' })).toBeVisible();

  // Paste → detect.
  await page.locator('textarea').fill(config);
  await page.getByRole('button', { name: 'Detect servers' }).click();

  // Preview lists the detected server with its transport type.
  await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText('streamable-http', { exact: true })).toBeVisible();

  // Import the (single, pre-selected) server.
  await page.getByRole('button', { name: /Import 1 server/ }).click();

  // Sheet closes and the imported server shows up in the table.
  await expect(page.getByRole('heading', { name: 'Import MCP servers' })).toBeHidden({ timeout: 8_000 });
  await expect(page.getByRole('main').getByText(name, { exact: true })).toBeVisible({ timeout: 8_000 });
});
