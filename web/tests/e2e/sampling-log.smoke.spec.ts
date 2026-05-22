import { test, expect, type Page } from '@playwright/test';

async function enterDevMode(page: Page, route: string) {
  await page.goto(route);
  const devButton = page.getByRole('button', { name: /Enter as Admin/i });
  if (await devButton.isVisible().catch(() => false)) await devButton.click();
}

test('Sampling Log page renders with stat cards and filter controls', async ({ page }) => {
  await enterDevMode(page, '/dashboard/sampling-log');
  await expect(page.getByRole('heading', { name: 'Sampling Log' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Attempts \(24h\)/i)).toBeVisible();
  await expect(page.getByPlaceholder(/filter by server/i)).toBeVisible();
});
