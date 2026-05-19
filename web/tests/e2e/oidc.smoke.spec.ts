import { test, expect, type Page } from '@playwright/test';

async function enterDevMode(page: Page, route: string) {
  await page.goto(route);
  const devButton = page.getByRole('button', { name: /Enter as Admin/i });
  if (await devButton.isVisible().catch(() => false)) await devButton.click();
}

test('OIDC Providers page renders (empty in dev mode)', async ({ page }) => {
  await enterDevMode(page, '/dashboard/oidc');
  await expect(page.getByRole('heading', { name: 'OIDC Providers' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('No OIDC providers configured')).toBeVisible();
});
