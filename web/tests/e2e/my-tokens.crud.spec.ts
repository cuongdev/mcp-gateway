import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './support/auth';

// My Tokens (Personal Access Tokens) coverage is limited to page structure and
// the empty state.
//
// PAT CRUD cannot be exercised in this environment: the test gateway runs in
// dev mode and auto-injects an admin principal whose type is `service_account`,
// but the PAT API rejects non-user principals — POST /api/users/me/tokens
// returns 403 "Only users can manage PATs". So we cannot seed, create, or
// revoke a token here; we only assert the page renders its heading, the
// "New PAT" CTA, and the empty state.

test('My Tokens page renders heading and New PAT CTA', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/my-tokens');
  await expect(page.getByRole('heading', { name: 'My Tokens' })).toBeVisible({ timeout: 10_000 });
  // Header CTA to open the create sheet
  await expect(page.getByRole('button', { name: 'New PAT' }).first()).toBeVisible();
});

test('My Tokens shows the empty state for the dev principal', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/my-tokens');
  await expect(page.getByRole('heading', { name: 'My Tokens' })).toBeVisible({ timeout: 10_000 });
  // No PATs can exist for the service_account dev principal, so the empty
  // state renders with its CTA.
  await expect(page.getByText('No personal tokens yet')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Create a PAT to authenticate the CLI/i)).toBeVisible();
});

test('opening the New PAT sheet shows the create form', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/my-tokens');
  await expect(page.getByRole('heading', { name: 'My Tokens' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'New PAT' }).first().click();
  // The new-token sheet renders its labeled fields.
  await expect(page.getByRole('heading', { name: 'New Personal Access Token' })).toBeVisible();
  await expect(page.getByLabel('Name')).toBeVisible();
  await expect(page.getByLabel('Expires in (days, optional)')).toBeVisible();
});
