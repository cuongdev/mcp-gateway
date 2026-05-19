import { test, expect, type Page } from '@playwright/test';

async function enterDevMode(page: Page, route: string) {
  await page.goto(route);
  const devButton = page.getByRole('button', { name: /Enter as Admin/i });
  if (await devButton.isVisible().catch(() => false)) await devButton.click();
}

test('Groups page renders heading + Create Group CTA opens sheet', async ({ page }) => {
  await enterDevMode(page, '/dashboard/groups');
  await expect(page.getByRole('heading', { name: 'Tool Groups' })).toBeVisible({ timeout: 10_000 });
  // Header CTA is always present regardless of whether groups are seeded
  await page.getByRole('button', { name: 'Create Group' }).first().click();
  await expect(page.getByRole('heading', { name: 'Create Tool Group' })).toBeVisible();
});
