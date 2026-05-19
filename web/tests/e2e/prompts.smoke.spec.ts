import { test, expect, type Page } from '@playwright/test';

async function enterDevMode(page: Page, route: string) {
  await page.goto(route);
  const devButton = page.getByRole('button', { name: /Enter as Admin/i });
  if (await devButton.isVisible().catch(() => false)) await devButton.click();
}

test('Prompts page renders (empty state on fresh gateway)', async ({ page }) => {
  await enterDevMode(page, '/dashboard/prompts');
  await expect(page.getByRole('heading', { name: 'Prompts' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('No prompts discovered')).toBeVisible();
});
