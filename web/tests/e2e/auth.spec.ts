import { test, expect } from '@playwright/test';

// Auth shell behaviour. In dev mode (NODE_ENV=test) the gateway auto-injects an
// anonymous service_account principal, so /auth/me always resolves and the app
// loads without an explicit login step — there is no "logged out" gate to
// redirect from. These tests assert the dev-mode entry and the sign-out UI,
// which were previously uncovered.

test('app loads straight into the shell in dev mode (no login required)', async ({ page }) => {
  await page.goto('/dashboard/overview');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible({ timeout: 10_000 });
  // The dev principal is treated as admin, so an admin-gated page is reachable.
  await page.goto('/dashboard/users');
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible({ timeout: 10_000 });
});

test('the account menu exposes sign out and routes to the login screen', async ({ page }) => {
  await page.goto('/dashboard/overview');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'Account' }).click();
  await expect(page.getByRole('menuitem', { name: /Sign out/i })).toBeVisible();
  await page.getByRole('menuitem', { name: /Sign out/i }).click();

  await expect(page).toHaveURL(/\/login/);
  // Dev-mode login screen offers the "Enter as Admin" affordance.
  await expect(page.getByRole('button', { name: /Enter as Admin/i })).toBeVisible({ timeout: 10_000 });
});
