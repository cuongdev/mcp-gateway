import { test, expect, loginAsAdmin } from './support/fixtures';

// The tool detail sheet has a "Test tool" playground; the server detail sheet
// lists discovered tools and links to each tool's detail. The mock upstream
// answers tools/call with { content: [{ type: 'text', text: 'ok' }] }.

test('test-call a discovered tool from the tool detail sheet', async ({ page, api }) => {
  const server = await api.createServer({ path: '/fs' });
  const canonical = `${server.name}__read_file`;

  await loginAsAdmin(page, `/dashboard/tools/${encodeURIComponent(canonical)}`);
  await expect(page.getByText('Test tool')).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'Run' }).click();

  // Result panel renders the upstream tools/call response (mock returns "ok").
  await expect(page.locator('pre').filter({ hasText: 'ok' })).toBeVisible({ timeout: 8_000 });
});

test('server detail lists discovered tools and links to the tool detail', async ({ page, api }) => {
  const server = await api.createServer({ path: '/fs' });

  await loginAsAdmin(page, `/dashboard/servers/${encodeURIComponent(server.name)}`);
  await expect(page.getByText('Click a tool to inspect & test it.')).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: `${server.name}__read_file`, exact: true }).click();
  await expect(page.getByText('Test tool')).toBeVisible({ timeout: 8_000 });
});
