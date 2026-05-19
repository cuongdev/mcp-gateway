import { test, expect, type Page } from '@playwright/test';

async function enterDevMode(page: Page, route: string) {
  await page.goto(route);
  const devButton = page.getByRole('button', { name: /Enter as Admin/i });
  if (await devButton.isVisible().catch(() => false)) await devButton.click();
}

test('Metrics page renders raw exposition or unavailable', async ({ page }) => {
  await enterDevMode(page, '/dashboard/metrics');
  await expect(page.getByRole('heading', { name: 'Metrics' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Raw exposition').or(page.getByText('Metrics unavailable')).first()).toBeVisible();
});
