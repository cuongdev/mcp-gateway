import { type Page } from '@playwright/test';

/**
 * Navigate to a dashboard route and enter the app as the dev admin.
 *
 * In dev mode (NODE_ENV=test) the login page renders a single
 * "Enter as Admin (Dev Mode)" button which issues a session cookie via
 * POST /auth/dev-login. This helper replaces the per-spec `enterDevMode`
 * copies that previously lived in every smoke test.
 */
export async function loginAsAdmin(page: Page, route = '/dashboard/overview'): Promise<void> {
  await page.goto(route);
  const devButton = page.getByRole('button', { name: /Enter as Admin/i });
  if (await devButton.isVisible().catch(() => false)) {
    await devButton.click();
  }
}
