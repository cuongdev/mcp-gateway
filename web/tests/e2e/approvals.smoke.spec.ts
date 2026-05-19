import { test, expect, type Page } from '@playwright/test';

async function enterDevMode(page: Page, route: string) {
  await page.goto(route);
  const devButton = page.getByRole('button', { name: /Enter as Admin/i });
  if (await devButton.isVisible().catch(() => false)) await devButton.click();
}

test('Approvals page renders empty state (no pending on fresh gateway)', async ({ page }) => {
  await enterDevMode(page, '/dashboard/approvals');
  await expect(page.getByRole('heading', { name: 'Approvals' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('No pending approvals')).toBeVisible();
});
