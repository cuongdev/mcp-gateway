import { test, expect } from '@playwright/test';
import { enterAsUser } from './support/auth';

// Runs in the `my-tokens` Playwright project against the requireAuthForApi
// gateway (config/e2e-pat.json). enterAsUser logs in as the in-process "dev"
// *user* principal via POST /auth/dev-login, so PAT management — which rejects
// non-user principals (403 "Only users can manage PATs") — is exercisable.
//
// The lifecycle test creates then revokes its token, leaving the shared store
// clean so the suite is re-run safe without per-test API cleanup.

test('create a PAT → one-time reveal → list → revoke → gone', async ({ page }) => {
  await enterAsUser(page, '/dashboard/my-tokens');
  await expect(page.getByRole('heading', { name: 'My Tokens' })).toBeVisible({ timeout: 10_000 });

  // ── Create ──────────────────────────────────────────
  await page.getByRole('button', { name: 'New PAT' }).first().click();
  await expect(page.getByRole('heading', { name: 'New Personal Access Token' })).toBeVisible();
  await page.getByLabel('Name').fill('e2e-cli-token');
  await page.getByRole('button', { name: 'Create' }).click();

  // ── One-time reveal ─────────────────────────────────
  const revealDialog = page.getByRole('dialog');
  await expect(revealDialog.getByText('Personal access token created')).toBeVisible({ timeout: 8_000 });
  await expect(revealDialog.getByText(/^mcp_pat_live_/)).toBeVisible(); // the raw token, shown once
  await page.getByRole('button', { name: /I've saved it/i }).click();

  // ── List ────────────────────────────────────────────
  await expect(page.getByText('e2e-cli-token')).toBeVisible({ timeout: 8_000 });

  // ── Revoke (leaves the store clean) ─────────────────
  await page.getByRole('button', { name: 'Revoke token' }).click();
  await page.getByRole('button', { name: 'Revoke' }).click();
  await expect(page.getByText('No personal tokens yet')).toBeVisible({ timeout: 8_000 });
});
