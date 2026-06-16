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

  await page.locator('textarea').fill(config);
  await page.getByRole('button', { name: 'Detect servers' }).click();

  // Preview row: name + URL are editable inputs, transport type is a badge.
  await expect(page.getByText('streamable-http', { exact: true })).toBeVisible({ timeout: 8_000 });
  await expect(page.getByLabel(`URL for ${name}`)).toHaveValue(mockUpstream('/fs'));

  await page.getByRole('button', { name: /Import 1 server/ }).click();

  // Sheet closes and the imported server shows up in the table.
  await expect(page.getByRole('heading', { name: 'Import MCP servers' })).toBeHidden({ timeout: 8_000 });
  await expect(page.getByRole('main').getByText(name, { exact: true })).toBeVisible({ timeout: 8_000 });
});

test('workspace path resolves ${workspaceFolder} in the import preview', async ({ page }) => {
  const config = JSON.stringify({
    mcpServers: { codegraph: { command: 'codegraph', args: ['serve', '--mcp', '--path', '${workspaceFolder}'] } },
  });

  await loginAsAdmin(page, '/dashboard/servers');
  await page.getByRole('button', { name: 'Import' }).click();
  await page.locator('textarea').fill(config);
  await page.getByRole('button', { name: 'Detect servers' }).click();

  // The unresolved-variable warning + Workspace path field appear.
  await expect(page.getByText(/Unresolved .*workspaceFolder/)).toBeVisible({ timeout: 8_000 });
  const argsInput = page.getByLabel('Args for codegraph');
  await expect(argsInput).toHaveValue(/\$\{workspaceFolder\}/);

  // Set a path and apply → the placeholder is replaced, warning clears.
  await page.getByLabel('Workspace path').fill('/Users/me/projects/app');
  await page.getByRole('button', { name: 'Apply' }).click();

  await expect(argsInput).toHaveValue('serve --mcp --path /Users/me/projects/app');
  await expect(page.getByText(/Unresolved .*workspaceFolder/)).toHaveCount(0);
});
