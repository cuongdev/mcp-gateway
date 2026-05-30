import { test, expect, loginAsAdmin } from './support/fixtures';

// Deeper coverage for the Rate Limit page (Reliability group).
//
// The Rate Limit page is a read-only view of /api/rate-limit/status.
// The gateway always returns a status object (enabled=true, backend=memory,
// default=<string>, rules=[]). Tests assert the real API response structure
// renders with concrete values rather than just checking heading presence.
//
// Strict-mode note: short badge values like "on" appear as a substring of the
// subtitle ("configuration"), so badge assertions use { exact: true } and the
// rule-count badge is scoped to its containing card.
//
// No seeding is required — the status endpoint always responds.

test('Status card renders with real enabled/backend/default values', async ({ page, api }) => {
  const status = await api.get<{ enabled: boolean; backend: string; default: string; rules: unknown[] }>(
    '/api/rate-limit/status',
  );
  await loginAsAdmin(page, '/dashboard/rate-limit');
  await expect(page.getByRole('heading', { name: 'Rate Limit' })).toBeVisible({ timeout: 10_000 });

  const main = page.getByRole('main');
  // "Status" card title.
  await expect(main.getByText('Status', { exact: true })).toBeVisible();

  // Enabled row — badge text is exactly "on" or "off" depending on config.
  const enabledLabel = status.enabled ? 'on' : 'off';
  await expect(main.getByText(enabledLabel, { exact: true })).toBeVisible();

  // Backend row — value is "memory" or "redis".
  await expect(main.getByText(status.backend, { exact: true })).toBeVisible();

  // Default row — rendered as a monospace code element.
  await expect(main.getByText(status.default, { exact: true })).toBeVisible();
});

test('Status card row labels are present', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/rate-limit');
  await expect(page.getByRole('heading', { name: 'Rate Limit' })).toBeVisible({ timeout: 10_000 });

  const main = page.getByRole('main');
  await expect(main.getByText('Enabled', { exact: true })).toBeVisible();
  await expect(main.getByText('Backend', { exact: true })).toBeVisible();
  await expect(main.getByText('Default limit', { exact: true })).toBeVisible();
});

test('Rules card is present and shows count badge', async ({ page, api }) => {
  const status = await api.get<{ rules: unknown[] }>('/api/rate-limit/status');
  await loginAsAdmin(page, '/dashboard/rate-limit');
  await expect(page.getByRole('heading', { name: 'Rate Limit' })).toBeVisible({ timeout: 10_000 });

  const main = page.getByRole('main');
  await expect(main.getByText('Rules', { exact: true })).toBeVisible();
  // Scope the count badge to the Rules card title row so the bare number
  // doesn't collide with other text on the page.
  const rulesTitleRow = main.getByText('Rules', { exact: true }).locator('xpath=..');
  await expect(rulesTitleRow.getByText(String(status.rules.length), { exact: true })).toBeVisible();
});

test('Rules card shows empty-overrides message when rules array is empty', async ({ page, api }) => {
  const status = await api.get<{ rules: unknown[] }>('/api/rate-limit/status');
  if (status.rules.length > 0) {
    // Cannot assert the empty state when real rules exist.
    test.skip();
  }
  await loginAsAdmin(page, '/dashboard/rate-limit');
  await expect(page.getByRole('heading', { name: 'Rate Limit' })).toBeVisible({ timeout: 10_000 });

  await expect(
    page.getByText('No per-principal or per-tool overrides — every caller uses the default limit.'),
  ).toBeVisible();
});

test('page subtitle is correct', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/rate-limit');
  await expect(page.getByRole('heading', { name: 'Rate Limit' })).toBeVisible({ timeout: 10_000 });

  await expect(
    page.getByText("Read-only view of the gateway's rate-limit configuration"),
  ).toBeVisible();
});
