import { test, expect, type Page } from '@playwright/test';

async function enterDevMode(page: Page, route: string) {
  await page.goto(route);
  const devButton = page.getByRole('button', { name: /Enter as Admin/i });
  if (await devButton.isVisible().catch(() => false)) await devButton.click();
}

test('Cache page renders invalidate form', async ({ page }) => {
  await enterDevMode(page, '/dashboard/cache');
  await expect(page.getByRole('heading', { name: 'Cache' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByLabel(/Tool/i)).toBeVisible();
  await expect(page.getByLabel(/Principal/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Invalidate cache' })).toBeVisible();
});
