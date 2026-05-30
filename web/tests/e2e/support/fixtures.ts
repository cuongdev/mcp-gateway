import { test as base, expect } from '@playwright/test';
import { createSeedApi, type SeedApi } from './api';

/**
 * Extended Playwright `test` with a per-test `api` seed fixture.
 *
 * Usage:
 *   import { test, expect, loginAsAdmin } from './support/fixtures';
 *   test('shows seeded users', async ({ page, api }) => {
 *     const u = await api.createUser({ displayName: 'Alice' });
 *     await loginAsAdmin(page, '/dashboard/users');
 *     await expect(page.getByText('Alice')).toBeVisible();
 *   });
 *
 * The fixture auto-cleans everything it created after the test, so the shared
 * sqlite returns to empty and the empty-state smoke specs keep passing.
 */
export const test = base.extend<{ api: SeedApi }>({
  api: async ({ playwright, baseURL }, use) => {
    const api = await createSeedApi(playwright, baseURL ?? 'http://localhost:3001');
    await use(api);
    await api.cleanup();
    await api.ctx.dispose();
  },
});

export { expect };
export { loginAsAdmin } from './auth';
