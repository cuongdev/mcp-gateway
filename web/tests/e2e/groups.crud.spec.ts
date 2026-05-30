import { test, expect, loginAsAdmin } from './support/fixtures';
import { uid, type SeedApi } from './support/api';

// Deeper coverage for Tool Groups — seed→render, UI-create, detail sheet.
//
// group_tools.canonical_name has a FOREIGN KEY to a real discovered tool, so a
// group can only reference tools that actually exist. Each test that needs a
// tool first registers the /fs mock upstream and reads a real canonical name
// from /api/tools?all=true.

/** Register the /fs mock server and return a real discovered canonical tool name. */
async function seedRealTool(api: SeedApi): Promise<string> {
  await api.createServer({ path: '/fs' });
  const { tools } = await api.get<{ tools: Array<{ name: string; server: string }>; total: number }>('/api/tools?all=true');
  if (tools.length === 0) throw new Error('expected discovered tools from /fs upstream');
  return tools[0].name;
}

test('seeded group appears as a card on the Groups page', async ({ page, api }) => {
  const tool = await seedRealTool(api);
  const { name } = await api.createGroup({
    name: uid('grp'),
    description: 'E2E test group',
    tools: [tool],
  });
  await loginAsAdmin(page, '/dashboard/groups');
  await expect(page.getByRole('heading', { name: 'Tool Groups' })).toBeVisible({ timeout: 10_000 });
  const main = page.getByRole('main');
  // exact: true — the name also appears inside the /mcp/groups/<name> endpoint code.
  await expect(main.getByText(name, { exact: true })).toBeVisible();
  // Empty-state should be gone
  await expect(main.getByText('No tool groups yet')).toBeHidden();
  // The tool badge should appear
  await expect(main.getByText(tool)).toBeVisible();
  // The card footer shows the MCP endpoint path
  await expect(main.getByText(`/mcp/groups/${name}`)).toBeVisible();
});

test('create a tool group through the Create Group sheet', async ({ page, api }) => {
  // The Create button is disabled unless at least one tool chip is added, and
  // the tool must exist (FK). Seed a real discovered tool first.
  const tool = await seedRealTool(api);
  const name = uid('grp-ui');
  // Register cleanup — the UI-created group has no typed helper so we use generic del.
  api.onCleanup(async () => {
    await api.del(`/api/groups/${encodeURIComponent(name)}`).catch(() => undefined);
  });

  await loginAsAdmin(page, '/dashboard/groups');
  await page.getByRole('button', { name: 'Create Group' }).first().click();
  await expect(page.getByRole('heading', { name: 'Create Tool Group' })).toBeVisible();

  // Fill in the form
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Description').fill('Created via E2E');

  // ChipInput for tools — type a real canonical name and press Enter to commit a chip
  const toolsInput = page.getByRole('textbox', { name: 'tools' });
  await toolsInput.fill(tool);
  await toolsInput.press('Enter');

  await page.getByRole('button', { name: 'Create' }).click();

  // Sheet closes and the new card renders
  await expect(page.getByRole('heading', { name: 'Create Tool Group' })).toBeHidden();
  const main = page.getByRole('main');
  // exact: true — the name also appears inside the /mcp/groups/<name> endpoint code.
  await expect(main.getByText(name, { exact: true })).toBeVisible();
  await expect(main.getByText(tool)).toBeVisible();
});

test('clicking a group card navigates to the detail route', async ({ page, api }) => {
  const tool = await seedRealTool(api);
  const { name } = await api.createGroup({
    name: uid('grp-detail'),
    tools: [tool],
  });
  await loginAsAdmin(page, '/dashboard/groups');
  // exact: true — the name also appears inside the /mcp/groups/<name> endpoint code.
  await page.getByRole('main').getByText(name, { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/groups/${encodeURIComponent(name)}`));
  // Detail sheet renders the group name as the SheetTitle
  await expect(page.getByRole('dialog').getByText(name, { exact: true })).toBeVisible({ timeout: 10_000 });
});

test('detail sheet shows Tools / Filters / Roles tabs', async ({ page, api }) => {
  const tool = await seedRealTool(api);
  const { name } = await api.createGroup({
    name: uid('grp-tabs'),
    tools: [tool],
  });
  await loginAsAdmin(page, `/dashboard/groups/${encodeURIComponent(name)}`);
  // When the sheet is open the page heading is aria-hidden behind the modal,
  // so wait on the dialog instead.
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  // Tabs inside the sheet
  await expect(dialog.getByRole('tab', { name: 'Tools' })).toBeVisible();
  await expect(dialog.getByRole('tab', { name: 'Filters' })).toBeVisible();
  await expect(dialog.getByRole('tab', { name: 'Roles' })).toBeVisible();
  // Save + Delete buttons present
  await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Delete group' })).toBeVisible();
});
