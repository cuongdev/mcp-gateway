import { test, expect, type Page } from '@playwright/test';

async function enterDevMode(page: Page, route: string) {
  await page.goto(route);
  const devButton = page.getByRole('button', { name: /Enter as Admin/i });
  if (await devButton.isVisible().catch(() => false)) await devButton.click();
}

test('MCP Clients page renders empty state + New CTA opens sheet', async ({ page }) => {
  await enterDevMode(page, '/dashboard/mcp-clients');
  await expect(page.getByRole('heading', { name: 'MCP Clients' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('No MCP Clients yet')).toBeVisible();
  await page.getByRole('button', { name: 'New MCP Client' }).first().click();
  await expect(page.getByRole('heading', { name: 'Create MCP Client' })).toBeVisible();
});
