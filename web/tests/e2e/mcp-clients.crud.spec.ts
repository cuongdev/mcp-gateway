import { test, expect, loginAsAdmin } from './support/fixtures';
import { uid } from './support/api';

// Deeper coverage for MCP Clients — seed→render, UI-create (token reveal dialog),
// detail sheet, and token rotation flow.

test('seeded MCP client appears in the table', async ({ page, api }) => {
  const { name } = await api.createMcpClient({
    name: uid('client'),
    description: 'seeded by E2E',
  });
  await loginAsAdmin(page, '/dashboard/mcp-clients');
  await expect(page.getByRole('heading', { name: 'MCP Clients' })).toBeVisible({ timeout: 10_000 });
  const main = page.getByRole('main');
  await expect(main.getByText(name)).toBeVisible();
  await expect(main.getByText('No MCP Clients yet')).toBeHidden();
  // Scope to the seeded row — plain getByText('all') also matches the
  // "Allowed servers" column header.
  const row = main.getByRole('row', { name: new RegExp(name) });
  // Default allowedServers=['*'] shows the "all" badge in this row
  await expect(row.getByRole('cell', { name: 'all' })).toBeVisible();
  // Status badge in this row
  await expect(row.getByRole('cell', { name: 'Active' })).toBeVisible();
});

test('create an MCP client via the New MCP Client sheet shows token once', async ({ page, api }) => {
  const name = uid('client-ui');
  // Clean up the created client after the test.
  api.onCleanup(async () => {
    const { clients } = await api.get<{ clients: Array<{ principalId: string; name: string }> }>('/api/mcp-clients');
    const c = clients.find((x) => x.name === name);
    if (c) await api.del(`/api/mcp-clients/${encodeURIComponent(c.principalId)}`);
  });

  await loginAsAdmin(page, '/dashboard/mcp-clients');
  await page.getByRole('button', { name: 'New MCP Client' }).first().click();
  await expect(page.getByRole('heading', { name: 'Create MCP Client' })).toBeVisible();

  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Description (optional)').fill('Created via E2E');

  await page.getByRole('button', { name: 'Create' }).click();

  // After creation the TokenRevealDialog appears showing the token once
  await expect(page.getByRole('dialog').getByText('Client token created')).toBeVisible({ timeout: 10_000 });
  // Token is a non-empty code block
  const tokenCode = page.getByRole('dialog').locator('code');
  await expect(tokenCode).not.toBeEmpty();

  // Dismiss the dialog
  await page.getByRole('button', { name: "I've saved it" }).click();

  // Sheet closes and the new client row appears
  const main = page.getByRole('main');
  await expect(main.getByText(name)).toBeVisible();
});

test('clicking an MCP client row opens the detail sheet', async ({ page, api }) => {
  const { id, name } = await api.createMcpClient({ name: uid('client-detail') });
  await loginAsAdmin(page, '/dashboard/mcp-clients');
  await page.getByRole('main').getByText(name).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/mcp-clients/${encodeURIComponent(id)}`));
  // Detail sheet shows the client name as SheetTitle
  await expect(page.getByRole('dialog').getByText(name)).toBeVisible({ timeout: 10_000 });
});

test('detail sheet has Rotate token and Delete client controls', async ({ page, api }) => {
  const { id, name } = await api.createMcpClient({ name: uid('client-ctrl') });
  await loginAsAdmin(page, `/dashboard/mcp-clients/${encodeURIComponent(id)}`);
  // The detail route opens a modal sheet; the page heading is aria-hidden
  // behind it, so wait on the dialog and scope assertions to it.
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByText(name)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Rotate token' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Delete client' })).toBeVisible();
  // The Active/disabled switch is present in the sheet
  await expect(dialog.getByRole('switch')).toBeVisible();
});

test('rotating a token shows the new secret once in the reveal dialog', async ({ page, api }) => {
  const { id } = await api.createMcpClient({ name: uid('client-rotate') });
  await loginAsAdmin(page, `/dashboard/mcp-clients/${encodeURIComponent(id)}`);
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible({ timeout: 10_000 });

  await sheet.getByRole('button', { name: 'Rotate token' }).click();

  // TokenRevealDialog appears with "Rotated token" label
  await expect(page.getByRole('dialog').getByText('Rotated token created')).toBeVisible({ timeout: 10_000 });
  const tokenCode = page.getByRole('dialog').locator('code');
  await expect(tokenCode).not.toBeEmpty();

  await page.getByRole('button', { name: "I've saved it" }).click();
});
