import { test, expect, type Page } from '@playwright/test';

async function enterDevMode(page: Page, route: string) {
  await page.goto(route);
  const devButton = page.getByRole('button', { name: /Enter as Admin/i });
  if (await devButton.isVisible().catch(() => false)) await devButton.click();
}

test('Catalog page renders Browse + Installed tabs', async ({ page }) => {
  await enterDevMode(page, '/dashboard/catalog');
  await expect(page.getByRole('heading', { name: 'Catalog' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('tab', { name: 'Browse' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Installed/i })).toBeVisible();
});

test('Catalog browse shows category filter', async ({ page }) => {
  await enterDevMode(page, '/dashboard/catalog');
  await expect(page.getByPlaceholder(/Search connectors/i)).toBeVisible();
});
