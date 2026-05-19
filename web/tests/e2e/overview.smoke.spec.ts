import { test, expect } from '@playwright/test';

test('overview page renders with header + stat cards', async ({ page }) => {
  await page.goto('/dashboard/overview');

  // In dev-mode, no OIDC providers are configured. The login page renders
  // a single "Enter as Admin (Dev Mode)" button — click it to enter the shell.
  const devButton = page.getByRole('button', { name: /Enter as Admin/i });
  if (await devButton.isVisible().catch(() => false)) {
    await devButton.click();
  }

  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible({ timeout: 10_000 });
  // Stat cards — scoped to main to avoid sidebar navigation duplicates
  const main = page.getByRole('main');
  await expect(main.getByText('MCP Servers')).toBeVisible();
  await expect(main.getByText('Registered Tools')).toBeVisible();
  await expect(main.getByText('Tool Groups').first()).toBeVisible();
  await expect(main.getByText('Tool calls (24h)')).toBeVisible();
});

test('command palette opens with ⌘K and navigates', async ({ page }) => {
  await page.goto('/dashboard/overview');
  const devButton = page.getByRole('button', { name: /Enter as Admin/i });
  if (await devButton.isVisible().catch(() => false)) await devButton.click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible({ timeout: 10_000 });

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
  await expect(page.getByPlaceholder(/Type a command/i)).toBeVisible();

  await page.getByPlaceholder(/Type a command/i).fill('Servers');
  await page.getByRole('option', { name: 'Servers' }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/servers/);
});
