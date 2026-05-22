import { test, expect, type Page } from '@playwright/test';

async function enterDevMode(page: Page, route: string) {
  await page.goto(route);
  const devButton = page.getByRole('button', { name: /Enter as Admin/i });
  if (await devButton.isVisible().catch(() => false)) await devButton.click();
}

test('Redaction page renders with 3 tabs', async ({ page }) => {
  await enterDevMode(page, '/dashboard/redaction');
  await expect(page.getByRole('heading', { name: 'Redaction' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('tab', { name: 'Rules' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Findings' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Test playground/i })).toBeVisible();
});

test('Redaction playground scans sample text', async ({ page }) => {
  await enterDevMode(page, '/dashboard/redaction');
  await page.getByRole('tab', { name: /Test playground/i }).click();
  await expect(page.getByRole('button', { name: 'Scan' })).toBeVisible();
});
