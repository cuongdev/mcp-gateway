import { test, expect, type Page } from '@playwright/test';

async function enterDevMode(page: Page, route: string) {
  await page.goto(route);
  const devButton = page.getByRole('button', { name: /Enter as Admin/i });
  if (await devButton.isVisible().catch(() => false)) await devButton.click();
}

test('Proxies page renders empty state + New Proxy opens sheet', async ({ page }) => {
  await enterDevMode(page, '/dashboard/proxies');
  await expect(page.getByRole('heading', { name: 'Outbound Proxies' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('No proxies configured')).toBeVisible();
  await page.getByRole('button', { name: 'New Proxy' }).first().click();
  await expect(page.getByRole('heading', { name: 'Create Proxy' })).toBeVisible();
});
