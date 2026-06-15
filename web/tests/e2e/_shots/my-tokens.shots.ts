import { test } from '@playwright/test';
import { enterAsUser } from '../support/auth';

// Captures the My Tokens screen with a created PAT (user-cookie gateway).
// Run via the shots config's `shots-pat` project.
const OUT = '../docs/wiki/images';

test('capture My Tokens screenshot (with a PAT)', async ({ page }) => {
  await enterAsUser(page, '/dashboard/my-tokens');
  await page.locator('h1').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);

  // Create a token so the list (not the empty state) is shown.
  await page.getByRole('button', { name: 'New PAT' }).first().click();
  await page.getByLabel('Name').fill('laptop-cli');
  await page.getByRole('button', { name: 'Create' }).click();
  // Dismiss the one-time reveal dialog.
  await page.getByRole('button', { name: /I've saved it/i }).click().catch(() => undefined);
  await page.getByText('laptop-cli').first().waitFor({ state: 'visible', timeout: 8_000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/my-tokens.png`, fullPage: true });
});
