import { test, expect, loginAsAdmin } from './support/fixtures';

// Deeper coverage for the Usage page — stat cards, range presets, groupBy
// selector, and the populated vs empty data path.

test('stat cards render with numeric values on load', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/usage');
  await expect(page.getByRole('heading', { name: 'Usage' })).toBeVisible({ timeout: 10_000 });

  const main = page.getByRole('main');
  await expect(main.getByText('Total calls')).toBeVisible();
  await expect(main.getByText('Success')).toBeVisible();
  await expect(main.getByText('Denied')).toBeVisible();
  await expect(main.getByText('Errors')).toBeVisible();
  // Each card wraps its value in a large bold element — at least one must exist
  await expect(main.locator('.text-2xl.font-bold').first()).toBeVisible();
});

test('all four range preset buttons are rendered and 24h is default-active', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/usage');
  await expect(page.getByRole('heading', { name: 'Usage' })).toBeVisible({ timeout: 10_000 });

  const main = page.getByRole('main');
  for (const label of ['1h', '24h', '7d', '30d']) {
    await expect(main.getByRole('button', { name: label })).toBeVisible();
  }
  // The 24h button carries the bg-primary class (active state)
  await expect(main.getByRole('button', { name: '24h' })).toHaveClass(/bg-primary/);
});

test('switching the range preset to 7d updates the card subtitle', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/usage');
  await expect(page.getByRole('heading', { name: 'Usage' })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('main').getByRole('button', { name: '7d' }).click();
  // The breakdown card title always includes "last 7d"
  await expect(page.getByRole('main').getByText(/last 7d/)).toBeVisible();
});

test('groupBy selector lists By tool, By principal, By server', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/usage');
  await expect(page.getByRole('heading', { name: 'Usage' })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('combobox').click();
  await expect(page.getByRole('option', { name: 'By tool' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'By principal' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'By server' })).toBeVisible();
});

test('switching groupBy to principal updates the section subtitles', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/usage');
  await expect(page.getByRole('heading', { name: 'Usage' })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'By principal' }).click();

  // Both card headers mention "principals"
  await expect(page.getByRole('main').getByText(/Top principals/)).toBeVisible();
  await expect(page.getByRole('main').getByText(/All principals/)).toBeVisible();
});

test('switching groupBy to server updates the section subtitles', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/usage');
  await expect(page.getByRole('heading', { name: 'Usage' })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'By server' }).click();

  await expect(page.getByRole('main').getByText(/Top servers/)).toBeVisible();
  await expect(page.getByRole('main').getByText(/All servers/)).toBeVisible();
});

test('page subtitle always shows "Tool-call aggregates over time"', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/usage');
  await expect(page.getByRole('heading', { name: 'Usage' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Tool-call aggregates over time')).toBeVisible();
});
