import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './support/auth';

// OIDC Providers is a read-only page driven by gateway config. It is exercised
// in the `oidc` Playwright project, whose gateway (config/e2e-oidc.json) has a
// provider configured, so the populated card state is reachable. Providers are
// injected at startup via config — there is no create/delete admin API.

test('OIDC Providers page renders heading and read-only notice', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/oidc');
  await expect(page.getByRole('heading', { name: 'OIDC Providers' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Read-only view of configured identity providers/i)).toBeVisible();
});

test('OIDC provider card shows name, id, login URL, and copy affordance', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/oidc');
  await expect(page.getByRole('heading', { name: 'OIDC Providers' })).toBeVisible({ timeout: 10_000 });

  // Card content for the configured "Acme SSO" provider.
  await expect(page.getByText('Acme SSO', { exact: true })).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText('acme', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Login URL/i })).toBeVisible();
  await expect(page.getByText(/Users click "Sign in with Acme SSO"/i)).toBeVisible();

  // Read-only: no create/new button.
  await expect(page.getByRole('button', { name: /new/i })).toHaveCount(0);
});
