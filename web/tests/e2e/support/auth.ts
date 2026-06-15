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

/**
 * Establish a real *user* session and navigate to a route.
 *
 * Used by the `my-tokens` Playwright project, whose gateway runs with
 * `requireAuthForApi` so the session-cookie middleware is mounted on `/api`.
 * The dev "Enter as Admin" button issues a session cookie for a `user`
 * principal via POST /auth/dev-login (the in-process "dev" user). We wait for
 * that response so the cookie is stored, then navigate — subsequent `/api`
 * calls (e.g. PAT management, which rejects non-user principals) authenticate
 * as the user.
 */
export async function enterAsUser(page: Page, route: string): Promise<void> {
  // Land on the app origin first so the request resolves against baseURL and
  // the Set-Cookie lands in this context's cookie jar.
  await page.goto('/login');
  const resp = await page.request.post('/auth/dev-login');
  if (!resp.ok()) throw new Error(`dev-login failed: ${resp.status()} ${await resp.text()}`);
  await page.goto(route);
}
