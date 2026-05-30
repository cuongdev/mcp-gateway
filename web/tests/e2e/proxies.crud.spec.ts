import { test, expect, loginAsAdmin } from './support/fixtures';
import { uid } from './support/api';

// Deeper Proxies coverage: seed via API, create via UI, open detail sheet,
// toggle enabled/disabled, and delete. Complements proxies.smoke.spec.ts which
// only asserts the empty-state render.

test('seeded proxy appears in the table', async ({ page, api }) => {
  const name = uid('proxy');
  const body = { name, url: 'http://proxy.example.com:3128', description: 'seeded proxy' };
  const p = await api.post<{ id: string; name: string }>('/api/proxies', body);
  api.onCleanup(async () => { await api.del(`/api/proxies/${encodeURIComponent(p.id)}`).catch(() => undefined); });

  await loginAsAdmin(page, '/dashboard/proxies');
  await expect(page.getByRole('heading', { name: 'Outbound Proxies' })).toBeVisible({ timeout: 10_000 });

  const main = page.getByRole('main');
  await expect(main.getByText(name)).toBeVisible();
  // URL cell
  await expect(main.getByText('http://proxy.example.com:3128')).toBeVisible();
  // Enabled badge (default enabled)
  await expect(main.getByText('enabled').first()).toBeVisible();
});

test('create a proxy through the New Proxy sheet', async ({ page, api }) => {
  const name = uid('proxy');
  const url = 'http://corp.example.com:8080';

  // Register cleanup before UI creates it so we clean regardless of where it lands.
  api.onCleanup(async () => {
    const { proxies } = await api.get<{ proxies: Array<{ id: string; name: string }> }>('/api/proxies');
    const found = proxies.find((x) => x.name === name);
    if (found) await api.del(`/api/proxies/${encodeURIComponent(found.id)}`).catch(() => undefined);
  });

  await loginAsAdmin(page, '/dashboard/proxies');
  await page.getByRole('button', { name: 'New Proxy' }).first().click();

  await expect(page.getByRole('heading', { name: 'Create Proxy' })).toBeVisible();
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('URL').fill(url);
  await page.getByLabel('Description (optional)').fill('Created via UI');

  // Submit button becomes enabled once name and url are filled.
  await page.getByRole('button', { name: 'Create' }).click();

  // Sheet closes and row appears in table.
  await expect(page.getByRole('heading', { name: 'Create Proxy' })).toBeHidden();
  const main = page.getByRole('main');
  await expect(main.getByText(name)).toBeVisible();
  await expect(main.getByText(url)).toBeVisible();
});

test('clicking a proxy row opens the detail sheet', async ({ page, api }) => {
  const name = uid('proxy');
  const p = await api.post<{ id: string; name: string }>('/api/proxies', {
    name,
    url: 'http://proxy.example.com:3128',
  });
  api.onCleanup(async () => { await api.del(`/api/proxies/${encodeURIComponent(p.id)}`).catch(() => undefined); });

  await loginAsAdmin(page, '/dashboard/proxies');
  await expect(page.getByRole('heading', { name: 'Outbound Proxies' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('main').getByText(name).click();
  // URL changes to /dashboard/proxies/:id
  await expect(page).toHaveURL(/\/dashboard\/proxies\/.+/);
});

test('detail sheet shows name, URL input and enabled switch', async ({ page, api }) => {
  const name = uid('proxy');
  const p = await api.post<{ id: string; name: string; enabled: boolean }>('/api/proxies', {
    name,
    url: 'http://egress.example.com:3128',
  });
  api.onCleanup(async () => { await api.del(`/api/proxies/${encodeURIComponent(p.id)}`).catch(() => undefined); });

  await loginAsAdmin(page, `/dashboard/proxies/${encodeURIComponent(p.id)}`);
  // Scope to the detail sheet (a dialog) — the proxy name also renders in the
  // list row behind it, so a page-wide getByText would be a strict-mode clash.
  const dialog = page.getByRole('dialog');
  // Sheet title heading carries the proxy name (uid() yields regex-safe chars).
  await expect(dialog.getByRole('heading', { name: new RegExp(name) })).toBeVisible({ timeout: 10_000 });
  // URL field is present and pre-filled
  await expect(dialog.getByLabel('URL')).toHaveValue('http://egress.example.com:3128');
  // Enabled switch present
  await expect(dialog.locator('#enabled')).toBeVisible();
  // References section present
  await expect(dialog.getByText(/No servers or groups reference this proxy/i)).toBeVisible();
});

test('delete a proxy via the detail sheet danger zone', async ({ page, api }) => {
  const name = uid('proxy');
  const p = await api.post<{ id: string; name: string }>('/api/proxies', {
    name,
    url: 'http://todelete.example.com:3128',
  });
  // Best-effort cleanup in case delete assertion fails.
  api.onCleanup(async () => { await api.del(`/api/proxies/${encodeURIComponent(p.id)}`).catch(() => undefined); });

  await loginAsAdmin(page, `/dashboard/proxies/${encodeURIComponent(p.id)}`);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: new RegExp(name) })).toBeVisible({ timeout: 10_000 });

  // Open danger-zone delete (the trigger lives in the detail sheet).
  await dialog.getByRole('button', { name: /Delete proxy/i }).click();
  // Confirmation AlertDialog appears; confirm via its "Delete" button.
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Delete' }).click();

  // Sheet closes and we land on the list
  await expect(page).toHaveURL(/\/dashboard\/proxies$/);
  // Row is gone
  await expect(page.getByRole('main').getByText(name)).toBeHidden();
});
