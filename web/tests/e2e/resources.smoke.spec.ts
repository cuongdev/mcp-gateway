import { test, expect, type Page } from '@playwright/test';

async function enterDevMode(page: Page, route: string) {
  await page.goto(route);
  const devButton = page.getByRole('button', { name: /Enter as Admin/i });
  if (await devButton.isVisible().catch(() => false)) await devButton.click();
}

test('Resources page renders search + tree placeholder', async ({ page }) => {
  await enterDevMode(page, '/dashboard/resources');
  await expect(page.getByRole('heading', { name: 'Resources' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByPlaceholder(/Search by URI/i)).toBeVisible();
});
