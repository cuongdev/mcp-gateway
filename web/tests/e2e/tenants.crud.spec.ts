import { test, expect, loginAsAdmin } from './support/fixtures';
import { uid } from './support/api';

// Full CRUD + lifecycle coverage for Tenants — seed via API → assert row,
// create via UI new-sheet → assert row, open detail sheet, suspend/resume
// lifecycle. All data is cleaned up by the `api` fixture.

test('seeded tenant renders as a table row', async ({ page, api }) => {
  const slug = `t-${Date.now()}`;
  // Tenants cannot be deleted via the API (no DELETE route), so they persist
  // across runs — use a unique display name so assertions never collide with
  // leftovers from a prior run.
  const { displayName } = await api.createTenant({ slug, displayName: `Seed Tenant ${uid('t')}`, plan: 'free' });

  await loginAsAdmin(page, '/dashboard/tenants');
  await expect(page.getByRole('heading', { name: 'Tenants' })).toBeVisible({ timeout: 10_000 });

  const main = page.getByRole('main');
  await expect(main.getByText(displayName)).toBeVisible();
  await expect(main.getByText(slug)).toBeVisible();
  // Status badge renders as "active" on creation
  await expect(main.getByText('active').first()).toBeVisible();
  // Plan badge renders
  await expect(main.getByText('free').first()).toBeVisible();
  // Empty-state should not be visible
  await expect(main.getByText('No tenants yet')).toBeHidden();
});

test('create a tenant through the New Tenant sheet', async ({ page, api }) => {
  const slug = `t-${Date.now()}`;
  const displayName = `UI Tenant ${uid('tnt')}`;

  // Cleanup: find by slug and delete
  api.onCleanup(async () => {
    const { tenants } = await api.get<{ tenants: Array<{ id: string; slug: string }> }>('/api/system/tenants');
    const created = tenants.find((t) => t.slug === slug);
    if (created) await api.del(`/api/system/tenants/${encodeURIComponent(created.id)}`);
  });

  await loginAsAdmin(page, '/dashboard/tenants');
  await expect(page.getByRole('heading', { name: 'Tenants' })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'New Tenant' }).first().click();
  await expect(page.getByRole('heading', { name: 'Create Tenant' })).toBeVisible();

  await page.getByLabel('Slug').fill(slug);
  await page.getByLabel('Display name').fill(displayName);
  await page.getByLabel('Plan (optional)').fill('enterprise');
  await page.getByRole('button', { name: 'Create' }).click();

  // Sheet closes and new row appears in the table
  await expect(page.getByRole('heading', { name: 'Create Tenant' })).toBeHidden();
  const main = page.getByRole('main');
  await expect(main.getByText(displayName)).toBeVisible();
  await expect(main.getByText(slug)).toBeVisible();
  await expect(main.getByText('enterprise').first()).toBeVisible();
});

test('clicking a tenant row opens the detail sheet', async ({ page, api }) => {
  const slug = `t-${Date.now()}`;
  const { id, displayName } = await api.createTenant({ slug, displayName: `Detail Tenant ${uid('t')}`, plan: 'free' });

  await loginAsAdmin(page, '/dashboard/tenants');
  await expect(page.getByRole('heading', { name: 'Tenants' })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('main').getByText(displayName).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/tenants/${encodeURIComponent(id)}`));
  // Detail sheet shows the tenant display name as the sheet title
  await expect(page.getByRole('dialog').getByText(displayName)).toBeVisible({ timeout: 10_000 });
});

test('suspend then resume changes the status badge in the detail sheet', async ({ page, api }) => {
  const slug = `t-${Date.now()}`;
  const { id, displayName } = await api.createTenant({ slug, displayName: `Lifecycle Tenant ${uid('t')}`, plan: 'free' });

  await loginAsAdmin(page, `/dashboard/tenants/${encodeURIComponent(id)}`);

  // Navigating directly to the detail route opens the tenant detail sheet/dialog
  // (the list heading "Tenants" is not rendered in this view).
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  // Sheet title shows the tenant display name
  await expect(dialog.getByRole('heading', { name: displayName })).toBeVisible({ timeout: 10_000 });

  // Initially active — status reads "active" and "Suspend tenant" button is present
  await expect(dialog.getByText('active').first()).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Suspend tenant' })).toBeVisible();

  // Suspend
  await dialog.getByRole('button', { name: 'Suspend tenant' }).click();

  // After suspend: status badge changes to "suspended" and "Resume tenant" appears
  await expect(dialog.getByText('suspended')).toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByRole('button', { name: 'Resume tenant' })).toBeVisible();

  // Resume
  await dialog.getByRole('button', { name: 'Resume tenant' }).click();

  // After resume: status badge flips back to "active" and "Suspend tenant" reappears
  await expect(dialog.getByText('active').first()).toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByRole('button', { name: 'Suspend tenant' })).toBeVisible();
});
