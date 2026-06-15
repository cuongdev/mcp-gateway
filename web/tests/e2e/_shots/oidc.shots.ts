import { test } from '@playwright/test';
import { loginAsAdmin } from '../support/auth';

// Captures the populated OIDC Providers screen (gateway with a provider
// configured). Run via the shots config's `shots-oidc` project.
const OUT = '../docs/wiki/images';

test('capture OIDC providers screenshot', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/oidc');
  await page.locator('h1').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/oidc.png`, fullPage: true });
});
