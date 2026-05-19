import { test, expect, type Page } from '@playwright/test';

async function enterDevMode(page: Page, route: string) {
  await page.goto(route);
  const devButton = page.getByRole('button', { name: /Enter as Admin/i });
  if (await devButton.isVisible().catch(() => false)) await devButton.click();
}

test('Audit page renders empty state + filters', async ({ page }) => {
  await enterDevMode(page, '/dashboard/audit');
  await expect(page.getByRole('heading', { name: 'Audit' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByPlaceholder(/Action filter/i)).toBeVisible();
  await expect(page.getByText('No audit data in this range')).toBeVisible();
});
