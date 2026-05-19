import { test, expect, type Page } from '@playwright/test';

async function enterDevMode(page: Page, route: string) {
  await page.goto(route);
  const devButton = page.getByRole('button', { name: /Enter as Admin/i });
  if (await devButton.isVisible().catch(() => false)) await devButton.click();
}

test('Tools page renders with search + show-disabled toggle', async ({ page }) => {
  await enterDevMode(page, '/dashboard/tools');
  await expect(page.getByRole('heading', { name: 'Tools' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByPlaceholder(/Search tools/i)).toBeVisible();
  await expect(page.getByLabel(/Show disabled/i)).toBeVisible();
});
