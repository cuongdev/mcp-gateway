import { test, expect, type Page } from '@playwright/test';

async function enterDevMode(page: Page, route: string) {
  await page.goto(route);
  const devButton = page.getByRole('button', { name: /Enter as Admin/i });
  if (await devButton.isVisible().catch(() => false)) await devButton.click();
}

test('My Tokens page renders empty state + New PAT CTA opens sheet', async ({ page }) => {
  await enterDevMode(page, '/dashboard/my-tokens');
  await expect(page.getByRole('heading', { name: 'My Tokens' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'New PAT' }).first().click();
  await expect(page.getByRole('heading', { name: 'New Personal Access Token' })).toBeVisible();
});
