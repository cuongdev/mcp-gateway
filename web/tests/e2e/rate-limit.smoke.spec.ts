import { test, expect, type Page } from '@playwright/test';

async function enterDevMode(page: Page, route: string) {
  await page.goto(route);
  const devButton = page.getByRole('button', { name: /Enter as Admin/i });
  if (await devButton.isVisible().catch(() => false)) await devButton.click();
}

test('Rate Limit page renders status card', async ({ page }) => {
  await enterDevMode(page, '/dashboard/rate-limit');
  await expect(page.getByRole('heading', { name: 'Rate Limit' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Status')).toBeVisible();
});
