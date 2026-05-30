import { test, expect, loginAsAdmin } from './support/fixtures';
import { uid } from './support/api';

// Full CRUD + data coverage for Users — the reference pattern other feature
// CRUD specs follow: seed via API → assert it renders, create via UI → assert
// the row appears, open the detail sheet. Everything is cleaned up by the
// `api` fixture so the empty-state smoke spec still passes.

test('seeded user renders as a table row', async ({ page, api }) => {
  const u = await api.createUser({ displayName: 'Alice E2E' });
  await loginAsAdmin(page, '/dashboard/users');
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible({ timeout: 10_000 });
  const main = page.getByRole('main');
  await expect(main.getByText('Alice E2E')).toBeVisible();
  await expect(main.getByText(u.email)).toBeVisible();
  await expect(main.getByText('Active')).toBeVisible();
});

test('create a user through the New User sheet', async ({ page, api }) => {
  const email = `${uid('crud')}@example.com`;
  // Ensure cleanup even if an assertion throws mid-test.
  api.onCleanup(async () => {
    const { users } = await api.get<{ users: Array<{ principalId: string; email: string }> }>('/api/users');
    const created = users.find((x) => x.email === email);
    if (created) await api.del(`/api/users/${encodeURIComponent(created.principalId)}?hard=true`);
  });

  await loginAsAdmin(page, '/dashboard/users');
  await page.getByRole('button', { name: 'New User' }).first().click();
  await expect(page.getByRole('heading', { name: 'Create User' })).toBeVisible();

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Display name').fill('Created Via UI');
  await page.getByRole('button', { name: 'Create' }).click();

  // Sheet closes and the new row shows in the table.
  await expect(page.getByRole('heading', { name: 'Create User' })).toBeHidden();
  const main = page.getByRole('main');
  await expect(main.getByText('Created Via UI')).toBeVisible();
  await expect(main.getByText(email)).toBeVisible();
});

test('clicking a user row opens the detail sheet', async ({ page, api }) => {
  await api.createUser({ displayName: 'Detail Target' });
  await loginAsAdmin(page, '/dashboard/users');
  await page.getByRole('main').getByText('Detail Target').click();
  await expect(page).toHaveURL(/\/dashboard\/users\/.+/);
});
