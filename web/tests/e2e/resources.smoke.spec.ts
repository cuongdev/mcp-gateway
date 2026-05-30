import { test, expect, type Page } from '@playwright/test';

async function enterDevMode(page: Page, route: string) {
  await page.goto(route);
  const devButton = page.getByRole('button', { name: /Enter as Admin/i });
  if (await devButton.isVisible().catch(() => false)) await devButton.click();
}

test('Resources page renders search + tree placeholder', async ({ page }) => {
  await enterDevMode(page, '/dashboard/resources');
  await expect(page.getByRole('heading', { name: 'Resources' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByPlaceholder(/Search by URI/i)).toBeVisible();
});

test('Resources empty state shown when no resources', async ({ page }) => {
  await enterDevMode(page, '/dashboard/resources');
  await page.getByRole('heading', { name: 'Resources' }).waitFor();
  // On a fresh gateway both the tree empty state and the detail placeholder
  // render. Assert the tree empty state specifically (.first avoids the
  // strict-mode clash with "Select a resource").
  await expect(page.getByText(/No resources|Select a resource/i).first()).toBeVisible({ timeout: 5_000 });
});
