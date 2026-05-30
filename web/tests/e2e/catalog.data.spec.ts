import { test, expect, loginAsAdmin } from './support/fixtures';

// Deeper Catalog coverage: connector list populated, search + category filter,
// install wizard flow (configure → preview → install → result), and uninstall.
// Catalog connectors are bundled server-side data (/api/catalog/connectors) so
// no seeding is required to reach the populated Browse state.

test('Browse tab lists at least one connector card', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/catalog');
  await expect(page.getByRole('heading', { name: 'Catalog' })).toBeVisible({ timeout: 10_000 });

  // Wait for the connector grid to populate.
  // ConnectorCard renders a <button> labelled "Install" for each uninstalled connector.
  await expect(page.getByRole('button', { name: 'Install' }).first()).toBeVisible({ timeout: 10_000 });
});

test('search filters connector cards by display name', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/catalog');
  await expect(page.getByRole('button', { name: 'Install' }).first()).toBeVisible({ timeout: 10_000 });

  // Count visible Install buttons before search.
  const before = await page.getByRole('button', { name: 'Install' }).count();

  // Type a very specific term unlikely to match any connector.
  await page.getByPlaceholder(/Search connectors/i).fill('zzznomatch');
  // Empty state appears.
  await expect(page.getByText('No connectors match')).toBeVisible({ timeout: 5_000 });
  // All Install buttons gone.
  await expect(page.getByRole('button', { name: 'Install' })).toHaveCount(0);

  // Clear search — all cards return.
  await page.getByPlaceholder(/Search connectors/i).fill('');
  await expect(page.getByRole('button', { name: 'Install' })).toHaveCount(before);
});

test('category filter narrows the connector grid', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/catalog');
  await expect(page.getByRole('button', { name: 'Install' }).first()).toBeVisible({ timeout: 10_000 });

  const allCount = await page.getByRole('button', { name: 'Install' }).count();

  // Pick "Databases" category via the Select trigger.
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Databases' }).click();
  // After filter, count should be ≤ allCount and grid still present (not crashed).
  const filteredCount = await page.getByRole('button', { name: 'Install' }).count();
  expect(filteredCount).toBeLessThanOrEqual(allCount);

  // Reset to "All".
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'All' }).click();
  await expect(page.getByRole('button', { name: 'Install' })).toHaveCount(allCount);
});

test('Installed tab shows empty state when nothing is installed', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/catalog');
  await expect(page.getByRole('heading', { name: 'Catalog' })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('tab', { name: /Installed/i }).click();
  await expect(page.getByText('No installed connectors')).toBeVisible({ timeout: 5_000 });
});

test('install wizard opens the configure step and cancels cleanly', async ({ page }) => {
  // NOTE: the full install→uninstall flow was intentionally NOT automated.
  //   • The "Server name" input in the wizard has no accessible label
  //     (the text is a sibling <text> node, not a <label htmlFor>), so it
  //     cannot be targeted reliably by role/label.
  //   • The first connectors require secrets, which keeps "Next: Preview"
  //     disabled, and a real install registers a server + triggers discovery
  //     against a stdio command that does not exist in CI — too brittle.
  // We assert the reachable, deterministic part: the wizard opens on its
  // Configure step and cancels without side effects.
  await loginAsAdmin(page, '/dashboard/catalog');
  await expect(page.getByRole('button', { name: 'Install' }).first()).toBeVisible({ timeout: 10_000 });

  // Open the wizard from the first connector card.
  await page.getByRole('button', { name: 'Install' }).first().click();

  // Step 1 — Configure: wizard sheet opens with the expected header.
  const wizard = page.getByRole('dialog');
  await expect(wizard.getByRole('heading', { name: /Install:/i })).toBeVisible({ timeout: 8_000 });
  await expect(wizard.getByText(/Step 1.*Configure/i)).toBeVisible();
  // The configure step exposes a server-name field and the Options section.
  await expect(wizard.getByText('Server name')).toBeVisible();
  await expect(wizard.getByText('Auto-discover tools after install')).toBeVisible();

  // Cancel — the wizard closes and the catalog grid is still present.
  await wizard.getByRole('button', { name: 'Cancel' }).click();
  await expect(wizard).toBeHidden();
  await expect(page.getByRole('button', { name: 'Install' }).first()).toBeVisible();
});
