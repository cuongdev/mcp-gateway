import { test, expect, type Page } from '@playwright/test';

async function enterDevMode(page: Page, route: string) {
  await page.goto(route);
  const devButton = page.getByRole('button', { name: /Enter as Admin/i });
  if (await devButton.isVisible().catch(() => false)) await devButton.click();
}

test('Policies page renders both tabs', async ({ page }) => {
  await enterDevMode(page, '/dashboard/policies');
  await expect(page.getByRole('heading', { name: 'Access Control' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('tab', { name: 'Rules' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Role Bindings' })).toBeVisible();

  // Switch tab and confirm contents.
  await page.getByRole('tab', { name: 'Role Bindings' }).click();
  await expect(page.getByText(/Assign role to user/i)).toBeVisible();
});
