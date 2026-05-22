import { test, expect, type Page } from '@playwright/test';

async function enterDevMode(page: Page, route: string) {
  await page.goto(route);
  const devButton = page.getByRole('button', { name: /Enter as Admin/i });
  if (await devButton.isVisible().catch(() => false)) await devButton.click();
}

test('Virtual Tools page renders with new-tool button', async ({ page }) => {
  await enterDevMode(page, '/dashboard/virtual-tools');
  await expect(page.getByRole('heading', { name: 'Virtual Tools' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: /New virtual tool/i })).toBeVisible();
});
