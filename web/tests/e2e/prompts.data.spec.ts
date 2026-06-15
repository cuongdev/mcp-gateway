import { test, expect, loginAsAdmin } from './support/fixtures';

// Prompts are auto-discovered via the MCP prompts/list protocol when a server
// is registered (and re-discovered on POST /servers/:name/sync). The mock MCP
// upstream (web/tests/e2e/support/mock-mcp.mjs) serves a distinct prompt set per
// tool path (/fs → summarize_file + diff_files, /db → explain_query, /gh →
// review_pr), so registering a server populates the Prompts page.

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

test('Prompts page shows discovered prompts grouped by server', async ({ page, api }) => {
  const server = await api.createServer({ path: '/fs' });

  await loginAsAdmin(page, '/dashboard/prompts');
  await expect(page.getByRole('heading', { name: 'Prompts' })).toBeVisible({ timeout: 10_000 });

  // Server card carries a prompt-count badge (the /fs set has two prompts).
  await expect(page.getByText(server.name, { exact: true })).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText('2 prompts')).toBeVisible();

  // Both /fs prompts render by their original name (exact avoids the sr-only
  // "Toggle …__summarize_file" label that also contains the name).
  await expect(page.getByText('summarize_file', { exact: true })).toBeVisible();
  await expect(page.getByText('diff_files', { exact: true })).toBeVisible();
});

test('Prompt can be toggled off via the enabled switch', async ({ page, api }) => {
  const server = await api.createServer({ path: '/db' });

  await loginAsAdmin(page, '/dashboard/prompts');
  await expect(page.getByText(server.name, { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('explain_query', { exact: true })).toBeVisible();

  // The /db set has a single prompt → a single toggle switch, on by default.
  const sw = page.getByRole('switch').first();
  await expect(sw).toBeVisible();
  await sw.click();

  // Toast confirms the disable round-tripped through the admin API.
  await expect(page.getByText(/disabled/i)).toBeVisible({ timeout: 5_000 });
});
