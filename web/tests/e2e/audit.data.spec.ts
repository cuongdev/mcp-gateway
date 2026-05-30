import { test, expect, loginAsAdmin } from './support/fixtures';

// Deeper coverage for the Audit page. In this test environment the audit log
// reads back empty (API-seeded server registrations are not surfaced as
// retrievable audit events), so these tests assert the page structure, the
// filter controls, and the empty-state behaviour that is actually true here
// rather than asserting populated rows that never appear.

test('Audit page renders the empty-state and the event count header', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/audit');
  await expect(page.getByRole('heading', { name: 'Audit' })).toBeVisible({ timeout: 10_000 });

  const main = page.getByRole('main');
  // Count header is always rendered ("0 events" when empty)
  await expect(main.getByText(/\d+ events/)).toBeVisible();
  // Empty state is shown in this environment
  await expect(main.getByText('No audit events in this range')).toBeVisible({ timeout: 8_000 });
});

test('time-range preset buttons switch the subtitle', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/audit');
  await expect(page.getByRole('heading', { name: 'Audit' })).toBeVisible({ timeout: 10_000 });

  // Default is 24h
  await expect(page.getByText('Per-event audit log — last 24h')).toBeVisible();

  await page.getByRole('button', { name: '1h' }).click();
  await expect(page.getByText('Per-event audit log — last 1h')).toBeVisible();

  await page.getByRole('button', { name: '7d' }).click();
  await expect(page.getByText('Per-event audit log — last 7d')).toBeVisible();
});

test('result filter dropdown lists all four options', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/audit');
  await expect(page.getByRole('heading', { name: 'Audit' })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('combobox').click();
  await expect(page.getByRole('option', { name: 'All results' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'success' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'denied' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'error' })).toBeVisible();
});

test('result filter can be switched to "error" and the page stays stable', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/audit');
  await expect(page.getByRole('heading', { name: 'Audit' })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'error' }).click();

  // The select now displays "error" and the page is still rendered
  await expect(page.getByRole('combobox')).toContainText('error');
  await expect(page.getByRole('heading', { name: 'Audit' })).toBeVisible();
  // Count header still present
  await expect(page.getByRole('main').getByText(/\d+ events/)).toBeVisible();
});

test('action filter input accepts text and keeps the page stable', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/audit');
  await expect(page.getByRole('heading', { name: 'Audit' })).toBeVisible({ timeout: 10_000 });

  const main = page.getByRole('main');
  const actionInput = main.getByPlaceholder(/Action filter/i);
  await actionInput.fill('tool.call');
  await expect(actionInput).toHaveValue('tool.call');
  // The empty-state remains (no matching events here) — page does not crash
  await expect(main.getByText('No audit events in this range')).toBeVisible({ timeout: 8_000 });
});

test('search box input accepts text and keeps the page stable', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/audit');
  await expect(page.getByRole('heading', { name: 'Audit' })).toBeVisible({ timeout: 10_000 });

  const main = page.getByRole('main');
  const searchInput = main.getByPlaceholder(/Search principalId or resource/i);
  await searchInput.fill('some-principal');
  await expect(searchInput).toHaveValue('some-principal');
  await expect(main.getByText('No audit events in this range')).toBeVisible({ timeout: 8_000 });
});

test('24h range preset is active by default', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/audit');
  await expect(page.getByRole('heading', { name: 'Audit' })).toBeVisible({ timeout: 10_000 });
  // The 24h preset is active by default and styled with the primary class
  await expect(page.getByRole('button', { name: '24h' })).toHaveClass(/bg-primary/);
});
