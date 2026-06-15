import { test, expect } from '@playwright/test';
import { enterAsUser } from './support/auth';

// Runs in the `my-tokens` Playwright project against the requireAuthForApi
// gateway (config/e2e-pat.json). enterAsUser establishes a *user* session
// cookie so /api/users/me/tokens (which rejects non-user principals) responds.

test('My Tokens page renders heading and the New PAT CTA', async ({ page }) => {
  await enterAsUser(page, '/dashboard/my-tokens');
  await expect(page.getByRole('heading', { name: 'My Tokens' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'New PAT' }).first()).toBeVisible();
});

test('opening the New PAT sheet shows the create form', async ({ page }) => {
  await enterAsUser(page, '/dashboard/my-tokens');
  await expect(page.getByRole('heading', { name: 'My Tokens' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'New PAT' }).first().click();
  await expect(page.getByRole('heading', { name: 'New Personal Access Token' })).toBeVisible();
  await expect(page.getByLabel('Name')).toBeVisible();
  await expect(page.getByLabel('Expires in (days, optional)')).toBeVisible();
});
