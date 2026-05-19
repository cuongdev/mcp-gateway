import { test, expect, type Page } from '@playwright/test';

async function enterDevMode(page: Page, route: string) {
  await page.goto(route);
  const devButton = page.getByRole('button', { name: /Enter as Admin/i });
  if (await devButton.isVisible().catch(() => false)) await devButton.click();
}

test('Webhooks page renders empty state + New CTA opens sheet', async ({ page }) => {
  await enterDevMode(page, '/dashboard/webhooks');
  await expect(page.getByRole('heading', { name: 'Webhooks' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('No webhooks yet')).toBeVisible();
  await page.getByRole('button', { name: 'New Webhook' }).first().click();
  await expect(page.getByRole('heading', { name: 'Create Webhook' })).toBeVisible();
});
