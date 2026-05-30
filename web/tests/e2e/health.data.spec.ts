import { test, expect, loginAsAdmin } from './support/fixtures';

// Deeper coverage for the Health page — real gateway section values (status,
// version, uptime) and the upstream-servers card. /api/health always responds
// in a running gateway. NOTE: in this test environment the health endpoint's
// `servers` array is empty even after API-seeding a server (the health probe
// tracks its own registry), so the upstream tests assert the rendered
// structure / empty state rather than seeded rows.

test('Gateway card shows status, version, and uptime values', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/health');
  await expect(page.getByRole('heading', { name: 'Health' })).toBeVisible({ timeout: 10_000 });

  const main = page.getByRole('main');
  // The Gateway card title is present
  await expect(main.getByText('Gateway', { exact: true }).first()).toBeVisible();

  // Status row — a healthy / degraded / unhealthy badge
  await expect(main.getByText(/^(healthy|degraded|unhealthy)$/).first()).toBeVisible();

  // Version row — the version is rendered in a code element next to "Version"
  await expect(main.getByText('Version')).toBeVisible();
  const versionCode = main.getByText('Version').locator('xpath=following-sibling::code');
  await expect(versionCode).toBeVisible();
  await expect(versionCode).not.toBeEmpty();

  // Uptime row — the uptime value is a code element next to "Uptime"
  // (e.g. "5s", "3m", "1h 2m"). Target it precisely so we don't collide with
  // the "polling 10s" badge in the header.
  await expect(main.getByText('Uptime')).toBeVisible();
  const uptimeCode = main.getByText('Uptime').locator('xpath=following-sibling::code');
  await expect(uptimeCode).toBeVisible();
  await expect(uptimeCode).toHaveText(/\d+(s|m|h|d)/);
});

test('Gateway card shows a healthy badge when the gateway is running', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/health');
  await expect(page.getByRole('heading', { name: 'Health' })).toBeVisible({ timeout: 10_000 });

  // In a test environment the gateway is always running healthy
  await expect(page.getByRole('main').getByText('healthy').first()).toBeVisible({ timeout: 8_000 });
});

test('Upstream servers card is always rendered', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/health');
  await expect(page.getByRole('heading', { name: 'Health' })).toBeVisible({ timeout: 10_000 });

  // "Upstream servers" appears as a card title; the exact match disambiguates
  // it from the "No registered upstream servers." paragraph.
  await expect(page.getByRole('main').getByText('Upstream servers', { exact: true })).toBeVisible({ timeout: 8_000 });
});

test('Upstream servers card shows a numeric count badge', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/health');
  await expect(page.getByRole('heading', { name: 'Health' })).toBeVisible({ timeout: 10_000 });

  // The count badge sits right after the "Upstream servers" title and renders
  // a number (0 in this environment). Locate the badge by its proximity.
  const title = page.getByRole('main').getByText('Upstream servers', { exact: true });
  const badge = title.locator('xpath=following-sibling::*[1]');
  await expect(badge).toBeVisible({ timeout: 8_000 });
  await expect(badge).toHaveText(/^\d+$/);
});

test('Upstream servers card renders the empty-state when no servers are registered', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/health');
  await expect(page.getByRole('heading', { name: 'Health' })).toBeVisible({ timeout: 10_000 });

  // The health endpoint reports zero upstream servers in this environment.
  await expect(page.getByRole('main').getByText('No registered upstream servers.')).toBeVisible({ timeout: 8_000 });
});

test('polling badge shows "Last checked" and "polling 10s"', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/health');
  await expect(page.getByRole('heading', { name: 'Health' })).toBeVisible({ timeout: 10_000 });

  await expect(page.getByText(/polling 10s/)).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText(/Last checked/)).toBeVisible();
});

test('page subtitle is "Gateway + upstream server status"', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/health');
  await expect(page.getByRole('heading', { name: 'Health' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Gateway + upstream server status')).toBeVisible();
});
