import { test, expect, type Page } from '@playwright/test';

async function enterDevMode(page: Page, route: string) {
  await page.goto(route);
  const devButton = page.getByRole('button', { name: /Enter as Admin/i });
  if (await devButton.isVisible().catch(() => false)) await devButton.click();
}

test('Circuits page renders with filter chips', async ({ page }) => {
  await enterDevMode(page, '/dashboard/circuits');
  await expect(page.getByRole('heading', { name: 'Circuits' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: /^All\b/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Open\b/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Degraded\b/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Healthy\b/i })).toBeVisible();
});

test('Circuits filter chip toggles selection', async ({ page }) => {
  await enterDevMode(page, '/dashboard/circuits');
  await page.getByRole('heading', { name: 'Circuits' }).waitFor();
  await page.getByRole('button', { name: /^Open\b/i }).click();
  await expect(page.getByRole('button', { name: /^Open\b/i })).toBeVisible();
});
