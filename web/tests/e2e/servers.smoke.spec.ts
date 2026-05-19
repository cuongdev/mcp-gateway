import { test, expect, type Page } from '@playwright/test';

async function enterDevMode(page: Page, route: string) {
  await page.goto(route);
  const devButton = page.getByRole('button', { name: /Enter as Admin/i });
  if (await devButton.isVisible().catch(() => false)) await devButton.click();
}

test('Servers page renders empty state on fresh gateway', async ({ page }) => {
  await enterDevMode(page, '/dashboard/servers');
  await expect(page.getByRole('heading', { name: 'Servers' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('No servers registered')).toBeVisible();
});

test('Register Server CTA opens the new-server sheet', async ({ page }) => {
  await enterDevMode(page, '/dashboard/servers');
  await expect(page.getByRole('heading', { name: 'Servers' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Register Server' }).first().click();
  await expect(page.getByRole('heading', { name: 'Register MCP Server' })).toBeVisible();
  // Transport selector defaults to streamable-http; URL field visible
  await expect(page.getByLabel('URL')).toBeVisible();
});
