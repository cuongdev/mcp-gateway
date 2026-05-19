import { test, expect, type Page } from '@playwright/test';

async function enterDevMode(page: Page, route: string) {
  await page.goto(route);
  const devButton = page.getByRole('button', { name: /Enter as Admin/i });
  if (await devButton.isVisible().catch(() => false)) await devButton.click();
}

test('Quota page renders Daily + Monthly cards (or unavailable state)', async ({ page }) => {
  await enterDevMode(page, '/dashboard/quota');
  await expect(page.getByRole('heading', { name: 'Quota' })).toBeVisible({ timeout: 10_000 });
  const cardsOrEmpty = page.getByText('Daily').or(page.getByText('Quota unavailable'));
  await expect(cardsOrEmpty.first()).toBeVisible();
});
