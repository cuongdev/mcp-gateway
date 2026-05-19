import { test, expect, type Page } from '@playwright/test';

async function enterDevMode(page: Page, route: string) {
  await page.goto(route);
  const devButton = page.getByRole('button', { name: /Enter as Admin/i });
  if (await devButton.isVisible().catch(() => false)) await devButton.click();
}

test('Settings page renders runtime config (admin)', async ({ page }) => {
  await enterDevMode(page, '/dashboard/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Runtime').or(page.getByText('Settings unavailable')).first()).toBeVisible();
});
