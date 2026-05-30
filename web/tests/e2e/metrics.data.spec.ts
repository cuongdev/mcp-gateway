import { test, expect, loginAsAdmin } from './support/fixtures';

// Deeper coverage for the Metrics page — real counters, raw exposition block,
// and tracked metric cards. /api/metrics always has data in a running gateway.

test('Metrics page renders the three tracked metric cards', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/metrics');
  await expect(page.getByRole('heading', { name: 'Metrics' })).toBeVisible({ timeout: 10_000 });

  const main = page.getByRole('main');
  // The three TRACKED metric names are rendered as card titles
  await expect(main.getByText('mcp_tool_calls_total')).toBeVisible({ timeout: 8_000 });
  await expect(main.getByText('mcp_tool_errors_total')).toBeVisible();
  await expect(main.getByText('mcp_session_active')).toBeVisible();
});

test('Metrics page renders the Raw exposition card with line count badge', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/metrics');
  await expect(page.getByRole('heading', { name: 'Metrics' })).toBeVisible({ timeout: 10_000 });

  const main = page.getByRole('main');
  await expect(main.getByText('Raw exposition')).toBeVisible({ timeout: 8_000 });
  // Line count badge — matches "<n> lines" where n >= 1
  await expect(main.getByText(/\d+ lines/)).toBeVisible();
});

test('Raw exposition block contains Prometheus TYPE comment lines', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/metrics');
  await expect(page.getByRole('heading', { name: 'Metrics' })).toBeVisible({ timeout: 10_000 });

  const main = page.getByRole('main');
  // The <pre> block must contain standard Prometheus TYPE comment markers
  const pre = main.locator('pre');
  await expect(pre).toBeVisible({ timeout: 8_000 });
  await expect(pre).toContainText('# TYPE');
});

test('Raw exposition block contains always-present process/node metric lines', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/metrics');
  await expect(page.getByRole('heading', { name: 'Metrics' })).toBeVisible({ timeout: 10_000 });

  const pre = page.getByRole('main').locator('pre');
  await expect(pre).toBeVisible({ timeout: 8_000 });
  // The mcp_* counters only appear after a tool call, but the default
  // Node/process metrics are always present in the exposition.
  await expect(pre).toContainText('process_cpu_seconds_total');
  await expect(pre).toContainText('nodejs_');
});

test('each tracked metric card shows a numeric value', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/metrics');
  await expect(page.getByRole('heading', { name: 'Metrics' })).toBeVisible({ timeout: 10_000 });

  const main = page.getByRole('main');
  // Wait for the metric cards to render their values
  await expect(main.getByText('mcp_tool_calls_total')).toBeVisible({ timeout: 8_000 });

  // Each card wraps its value in a large bold element; at least 3 must exist
  // (one per tracked metric).
  const valueEls = main.locator('.text-2xl.font-bold.tabular-nums');
  await expect(valueEls).toHaveCount(3);
});

test('polling badge shows "Last fetched" timestamp and polling interval', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/metrics');
  await expect(page.getByRole('heading', { name: 'Metrics' })).toBeVisible({ timeout: 10_000 });

  // The badge in the page header always renders the polling text
  await expect(page.getByText(/polling 10s/)).toBeVisible({ timeout: 8_000 });
});

test('Metrics page subtitle is "Prometheus exposition + selected counters over time"', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/metrics');
  await expect(page.getByRole('heading', { name: 'Metrics' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Prometheus exposition + selected counters over time')).toBeVisible();
});
