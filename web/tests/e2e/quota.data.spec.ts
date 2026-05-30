import { test, expect, loginAsAdmin } from './support/fixtures';

// Deeper coverage for the Quota page (Reliability group).
//
// The Quota page fetches /api/quota/status and renders Daily + Monthly cards
// with a usage bar.  In the test gateway the endpoint either returns real
// counters or a 404/500 (which the page renders as an EmptyState).
// We read the real response from the API first so we can branch on whether
// quota is enabled and assert the exact rendered numbers rather than
// existence-only assertions.
//
// Strict-mode note: the card titles "Daily"/"Monthly" appear (case-insensitively)
// as substrings of the subtitle "...daily and monthly...", and the used value
// "0" appears in BOTH cards.  So card titles use { exact: true } and per-card
// numbers are scoped to that card's container.
//
// No seeding is needed — quota counters are derived from the dev principal's
// activity and reset independently.

/** Locate the card container for a given quota title ("Daily" | "Monthly"). */
function quotaCard(page: import('@playwright/test').Page, title: 'Daily' | 'Monthly') {
  // Card is the `.rounded-xl` container; filter to the one holding this title.
  // Exact word boundary on the title avoids "Daily" matching inside other text.
  return page
    .getByRole('main')
    .locator('div.rounded-xl')
    .filter({ has: page.getByText(title, { exact: true }) });
}

test('page heading and subtitle are correct', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/quota');
  await expect(page.getByRole('heading', { name: 'Quota' })).toBeVisible({ timeout: 10_000 });

  await expect(
    page.getByText("Current principal's daily and monthly tool-call quotas"),
  ).toBeVisible();
});

test('renders Daily and Monthly cards when quota endpoint responds', async ({ page, api }) => {
  let quotaAvailable = true;
  const status = await api
    .get<{ daily: { used: number; limit?: number }; monthly: { used: number; limit?: number } }>('/api/quota/status')
    .catch(() => { quotaAvailable = false; return null; });

  await loginAsAdmin(page, '/dashboard/quota');
  await expect(page.getByRole('heading', { name: 'Quota' })).toBeVisible({ timeout: 10_000 });

  if (!quotaAvailable || !status) {
    // Quota is disabled on this gateway — assert the empty state instead.
    await expect(page.getByText('Quota unavailable')).toBeVisible({ timeout: 8_000 });
    await expect(
      page.getByText(/quota\/status endpoint did not respond/),
    ).toBeVisible();
    return;
  }

  const main = page.getByRole('main');
  // Both card titles must be present (exact, so they don't match the subtitle).
  await expect(main.getByText('Daily', { exact: true })).toBeVisible();
  await expect(main.getByText('Monthly', { exact: true })).toBeVisible();

  // The used count from the API must appear inside the matching card.
  await expect(
    quotaCard(page, 'Daily').getByText(status.daily.used.toLocaleString(), { exact: true }),
  ).toBeVisible();
  await expect(
    quotaCard(page, 'Monthly').getByText(status.monthly.used.toLocaleString(), { exact: true }),
  ).toBeVisible();
});

test('limit column shows "/ unlimited" when no limit is configured', async ({ page, api }) => {
  const status = await api
    .get<{ daily: { used: number; limit?: number }; monthly: { used: number; limit?: number } }>('/api/quota/status')
    .catch(() => null);

  if (!status) {
    test.skip();
  }

  // Only run this assertion if at least one limit is absent (unlimited).
  if (status!.daily.limit !== undefined && status!.monthly.limit !== undefined) {
    // Both limits are set — "/ unlimited" text won't appear; skip.
    test.skip();
  }

  await loginAsAdmin(page, '/dashboard/quota');
  await expect(page.getByRole('heading', { name: 'Quota' })).toBeVisible({ timeout: 10_000 });

  await expect(page.getByText('/ unlimited').first()).toBeVisible({ timeout: 8_000 });
});

test('usage bar limit value is displayed when a limit is configured', async ({ page, api }) => {
  const status = await api
    .get<{ daily: { used: number; limit?: number }; monthly: { used: number; limit?: number } }>('/api/quota/status')
    .catch(() => null);

  if (!status || (status.daily.limit === undefined && status.monthly.limit === undefined)) {
    // No limits set — bar is not rendered; skip rather than false-fail.
    test.skip();
  }

  await loginAsAdmin(page, '/dashboard/quota');
  await expect(page.getByRole('heading', { name: 'Quota' })).toBeVisible({ timeout: 10_000 });

  // The limit renders as "/ N" alongside the used count. Assert each present
  // limit inside its own card to avoid cross-card ambiguity.
  if (status!.daily.limit !== undefined) {
    await expect(
      quotaCard(page, 'Daily').getByText(`/ ${status!.daily.limit.toLocaleString()}`, { exact: true }),
    ).toBeVisible();
  }
  if (status!.monthly.limit !== undefined) {
    await expect(
      quotaCard(page, 'Monthly').getByText(`/ ${status!.monthly.limit.toLocaleString()}`, { exact: true }),
    ).toBeVisible();
  }
});

test('Quota unavailable empty state renders when endpoint is down', async ({ page, api }) => {
  // Only asserts the empty state path — can only run when the quota endpoint
  // actually returns an error.  Skip when it responds successfully.
  const status = await api.get('/api/quota/status').catch(() => null);
  if (status !== null) {
    test.skip();
  }

  await loginAsAdmin(page, '/dashboard/quota');
  await expect(page.getByRole('heading', { name: 'Quota' })).toBeVisible({ timeout: 10_000 });

  await expect(page.getByText('Quota unavailable')).toBeVisible({ timeout: 8_000 });
  await expect(
    page.getByText(/quota\/status endpoint did not respond/),
  ).toBeVisible();
});
