import { test, expect, type Page } from '@playwright/test';

async function enterDevMode(page: Page, route: string) {
  await page.goto(route);
  const devButton = page.getByRole('button', { name: /Enter as Admin/i });
  if (await devButton.isVisible().catch(() => false)) await devButton.click();
}

test('Health page renders gateway status', async ({ page }) => {
  await enterDevMode(page, '/dashboard/health');
  await expect(page.getByRole('heading', { name: 'Health' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Gateway', { exact: true }).first()).toBeVisible();
});
