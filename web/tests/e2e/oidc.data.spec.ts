import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './support/auth';

// OIDC Providers is a read-only page driven by gateway config — there is no
// create/delete API, so the only meaningful test is the empty-state in dev mode
// (no providers configured) and the page structure.
//
// The seeded-data path is not exercisable from tests because providers are
// injected at gateway startup time via config, not via the admin REST API.

test('OIDC Providers page renders heading and read-only notice', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/oidc');
  await expect(page.getByRole('heading', { name: 'OIDC Providers' })).toBeVisible({ timeout: 10_000 });
  // Sub-heading describes the read-only nature
  await expect(page.getByText(/Read-only view of configured identity providers/i)).toBeVisible();
});

test('OIDC Providers shows empty state in dev mode', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/oidc');
  await expect(page.getByRole('heading', { name: 'OIDC Providers' })).toBeVisible({ timeout: 10_000 });
  // Dev-mode gateway has no providers configured
  await expect(page.getByText('No OIDC providers configured')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Edit `oidcProviders` in your config file/i)).toBeVisible();
  // No create/new button — this page is read-only
  await expect(page.getByRole('button', { name: /new/i })).toBeHidden();
});
