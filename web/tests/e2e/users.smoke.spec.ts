import { test, expect, type Page } from '@playwright/test';

async function enterDevMode(page: Page, route: string) {
  await page.goto(route);
  const devButton = page.getByRole('button', { name: /Enter as Admin/i });
  if (await devButton.isVisible().catch(() => false)) await devButton.click();
}

test('Users page renders and New User CTA opens sheet', async ({ page }) => {
  await enterDevMode(page, '/dashboard/users');
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'New User' }).first().click();
  await expect(page.getByRole('heading', { name: 'Create User' })).toBeVisible();
});
