import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './support/auth';

// Runs in the `oidc` Playwright project against the gateway started with
// config/e2e-oidc.json, which configures one OIDC provider ("Acme SSO"). The
// gateway is still in dev mode (admin API open, dev principal injected), so the
// app loads without a real login while /auth/providers returns the provider.

test('OIDC Providers page renders the configured provider', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/oidc');
  await expect(page.getByRole('heading', { name: 'OIDC Providers' })).toBeVisible({ timeout: 10_000 });

  // The provider card shows its display name and id badge — no empty state.
  await expect(page.getByText('Acme SSO', { exact: true })).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText('acme', { exact: true })).toBeVisible();
  await expect(page.getByText('No OIDC providers configured')).toHaveCount(0);
});
