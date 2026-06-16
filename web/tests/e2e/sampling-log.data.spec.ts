import { test, expect, loginAsAdmin } from './support/fixtures';

// Deeper coverage for the Sampling Log page — stat cards, filter controls,
// empty-state rendering, and column header structure.
//
// NOTE: Sampling log entries are produced only by reverse-channel
// sampling/createMessage and roots/list calls, which the test mock upstream
// does not emit. Tests assert structure + empty-state rather than seeded rows.

test('Sampling Log page renders the three stat cards', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/sampling-log');
  await expect(page.getByRole('heading', { name: 'Sampling Log' })).toBeVisible({ timeout: 10_000 });

  const main = page.getByRole('main');
  await expect(main.getByText('Attempts (24h)')).toBeVisible();
  await expect(main.getByText('Top outcome')).toBeVisible();
  await expect(main.getByText('Top server')).toBeVisible();
});

test('page description mentions reverse-channel requests', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/sampling-log');
  await expect(page.getByRole('heading', { name: 'Sampling Log' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/reverse-channel requests/i)).toBeVisible();
});

test('server filter input is present and accepts text', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/sampling-log');
  await expect(page.getByRole('heading', { name: 'Sampling Log' })).toBeVisible({ timeout: 10_000 });

  const serverInput = page.getByPlaceholder('filter by server');
  await expect(serverInput).toBeVisible();
  await serverInput.fill('my-test-server');
  await expect(serverInput).toHaveValue('my-test-server');
});

test('Method filter combobox lists all three options', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/sampling-log');
  await expect(page.getByRole('heading', { name: 'Sampling Log' })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('combobox').click();
  await expect(page.getByRole('option', { name: 'All methods' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'sampling/createMessage' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'roots/list' })).toBeVisible();
});

test('empty state renders when there are no sampling log entries', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/sampling-log');
  await expect(page.getByRole('heading', { name: 'Sampling Log' })).toBeVisible({ timeout: 10_000 });

  // No reverse-channel traffic in the test environment — empty state appears
  await expect(page.getByRole('main').getByText('No sampling attempts logged')).toBeVisible({ timeout: 8_000 });
});

test('filtering by sampling/createMessage method stays stable', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/sampling-log');
  await expect(page.getByRole('heading', { name: 'Sampling Log' })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'sampling/createMessage' }).click();

  // Page stays stable — heading and stat cards remain
  await expect(page.getByRole('heading', { name: 'Sampling Log' })).toBeVisible();
  await expect(page.getByRole('main').getByText('Attempts (24h)')).toBeVisible();
});

test('filtering by roots/list method stays stable', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/sampling-log');
  await expect(page.getByRole('heading', { name: 'Sampling Log' })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'roots/list' }).click();

  await expect(page.getByRole('heading', { name: 'Sampling Log' })).toBeVisible();
  await expect(page.getByRole('main').getByText('Attempts (24h)')).toBeVisible();
});
