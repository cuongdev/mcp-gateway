import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './support/auth';

// Deeper Settings coverage — asserts real /api/system/info content renders,
// not just the heading. The page is read-only (no mutations), so no api
// fixture or cleanup is needed.

test('Runtime card shows version, startedAt and mode fields', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10_000 });

  // The "Runtime" card must be visible (not the unavailable empty-state)
  const main = page.getByRole('main');
  await expect(main.getByText('Runtime', { exact: true })).toBeVisible({ timeout: 10_000 });

  // Version row — label present
  await expect(main.getByText('Version')).toBeVisible();
  // Started at row — label present
  await expect(main.getByText('Started at')).toBeVisible();
  // Mode row — label present (exact avoids matching "mode" inside a config JSON blob)
  await expect(main.getByText('Mode', { exact: true })).toBeVisible();

  // "Settings unavailable" error state must NOT be shown
  await expect(main.getByText('Settings unavailable')).toBeHidden();
});

test('gateway config section renders', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10_000 });

  const main = page.getByRole('main');
  // Wait for the Runtime card to confirm data loaded
  await expect(main.getByText('Runtime', { exact: true })).toBeVisible({ timeout: 10_000 });

  // "gateway" section is always present in the config
  await expect(main.getByText('gateway', { exact: true })).toBeVisible();
});

test('auth config section renders', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10_000 });

  const main = page.getByRole('main');
  await expect(main.getByText('Runtime', { exact: true })).toBeVisible({ timeout: 10_000 });

  // "auth" section is always present in the config
  await expect(main.getByText('auth', { exact: true })).toBeVisible();
});

test('storage config section renders', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10_000 });

  const main = page.getByRole('main');
  await expect(main.getByText('Runtime', { exact: true })).toBeVisible({ timeout: 10_000 });

  // "storage" section is always present in the config
  await expect(main.getByText('storage', { exact: true })).toBeVisible();
});

test('/api/system/info returns valid version and mode values', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10_000 });

  const main = page.getByRole('main');
  await expect(main.getByText('Runtime', { exact: true })).toBeVisible({ timeout: 10_000 });

  // Version should be a non-empty string rendered in a <code> element.
  // The page renders: <code class="font-mono text-xs">{data.version ?? '—'}</code>
  // Assert at least one font-mono code cell has real text (not the "—" fallback).
  const versionCodes = main.locator('code.font-mono').filter({ hasNotText: '—' });
  await expect(versionCodes.first()).toBeVisible({ timeout: 10_000 });

  // Mode badge should render a truthy environment string, not the "—" fallback.
  await expect(main.getByText(/^(development|dev|production|prod|test|standalone)$/i).first()).toBeVisible();
});
