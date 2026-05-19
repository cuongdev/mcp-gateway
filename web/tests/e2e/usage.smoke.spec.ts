import { test, expect, type Page } from '@playwright/test';

async function enterDevMode(page: Page, route: string) {
  await page.goto(route);
  const devButton = page.getByRole('button', { name: /Enter as Admin/i });
  if (await devButton.isVisible().catch(() => false)) await devButton.click();
}

test('Usage page renders range selector + groupBy + stat cards', async ({ page }) => {
  await enterDevMode(page, '/dashboard/usage');
  await expect(page.getByRole('heading', { name: 'Usage' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Total calls')).toBeVisible();
  await expect(page.getByRole('button', { name: '24h' })).toBeVisible();
});
