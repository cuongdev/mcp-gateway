import { test, expect, loginAsAdmin } from './support/fixtures';

// The Overview stat cards link to their corresponding pages, and the Server
// status rows drill into the server detail.
test('Overview stat cards navigate to their pages', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/overview');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: /MCP Servers/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/servers/);
  await expect(page.getByRole('heading', { name: 'Servers' })).toBeVisible({ timeout: 10_000 });
});

test('Overview "Registered Tools" card opens the Tools page', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/overview');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: /Registered Tools/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/tools/);
  await expect(page.getByRole('heading', { name: 'Tools' })).toBeVisible({ timeout: 10_000 });
});
