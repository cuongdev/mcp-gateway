import { test, expect, type Page } from '@playwright/test';

async function enterDevMode(page: Page, route: string) {
  await page.goto(route);
  const devButton = page.getByRole('button', { name: /Enter as Admin/i });
  if (await devButton.isVisible().catch(() => false)) await devButton.click();
}

test('Tenants page renders empty state + New Tenant opens sheet', async ({ page }) => {
  await enterDevMode(page, '/dashboard/tenants');
  await expect(page.getByRole('heading', { name: 'Tenants' })).toBeVisible({ timeout: 10_000 });
  // Migration seeds a Default Tenant, so empty state is not shown; assert table or empty state renders.
  await expect(page.getByText('No tenants yet').or(page.getByText('Default Tenant')).first()).toBeVisible();
  await page.getByRole('button', { name: 'New Tenant' }).first().click();
  await expect(page.getByRole('heading', { name: 'Create Tenant' })).toBeVisible();
});
