import { test, expect, loginAsAdmin } from './support/fixtures';
import { uid } from './support/api';

// Deeper coverage for Policies (Access Control) — seed→render, UI-add policy rule,
// UI-add role binding, and removal flows for each.

test('seeded policy rule appears in the Rules table', async ({ page, api }) => {
  const sub = uid('pol-sub');
  await api.addPolicy({ sub, obj: 'tool:fs__read_file', act: 'execute' });

  await loginAsAdmin(page, '/dashboard/policies');
  await expect(page.getByRole('heading', { name: 'Access Control' })).toBeVisible({ timeout: 10_000 });

  // Rules tab is the default
  const main = page.getByRole('main');
  await expect(main.getByText(sub)).toBeVisible();
  await expect(main.getByText('tool:fs__read_file')).toBeVisible();
  await expect(main.getByText('execute')).toBeVisible();
  // Empty-state should be gone
  await expect(main.getByText('No policy rules')).toBeHidden();
});

test('add a policy rule via the inline form and it appears in the table', async ({ page, api }) => {
  const sub = uid('pol-add');
  // Register cleanup for the UI-added rule.
  api.onCleanup(async () => {
    await api.ctx.delete('/api/policies', {
      data: { sub, obj: 'tool:db__query', act: 'execute' },
    }).catch(() => undefined);
  });

  await loginAsAdmin(page, '/dashboard/policies');
  await expect(page.getByRole('heading', { name: 'Access Control' })).toBeVisible({ timeout: 10_000 });

  // Fill the inline Add policy rule form
  await page.getByLabel('Subject').fill(sub);
  await page.getByLabel('Object').fill('tool:db__query');
  await page.getByLabel('Action').fill('execute');
  await page.getByRole('button', { name: 'Add' }).click();

  // Row appears in the table
  const main = page.getByRole('main');
  await expect(main.getByText(sub)).toBeVisible({ timeout: 10_000 });
  await expect(main.getByText('tool:db__query')).toBeVisible();
  // Form fields are cleared after submit
  await expect(page.getByLabel('Subject')).toHaveValue('');
});

test('removing a seeded policy rule hides it from the table', async ({ page, api }) => {
  const sub = uid('pol-rm');
  await api.addPolicy({ sub, obj: 'tool:gh__list_repos', act: 'execute' });

  await loginAsAdmin(page, '/dashboard/policies');
  await expect(page.getByRole('heading', { name: 'Access Control' })).toBeVisible({ timeout: 10_000 });
  const main = page.getByRole('main');
  await expect(main.getByText(sub)).toBeVisible({ timeout: 10_000 });

  // Click the trash icon button in the row
  await main.getByRole('button', { name: 'Remove rule' }).first().click();

  // Row disappears (no confirmation dialog for policy row removal)
  await expect(main.getByText(sub)).toBeHidden({ timeout: 10_000 });
});

test('Role Bindings tab renders the Assign role to user form', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/policies');
  await expect(page.getByRole('heading', { name: 'Access Control' })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('tab', { name: 'Role Bindings' }).click();

  // Scope to the active tabpanel — plain getByLabel('Role') also matches the
  // tabpanel itself (aria-labelledby points at the "Role Bindings" trigger).
  const panel = page.getByRole('tabpanel', { name: 'Role Bindings' });
  await expect(panel.getByText('Assign role to user')).toBeVisible();
  await expect(panel.getByRole('textbox', { name: 'User' })).toBeVisible();
  await expect(panel.getByRole('textbox', { name: 'Role' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Assign' })).toBeVisible();
});

test('add a role binding via the UI and it appears in the bindings table', async ({ page, api }) => {
  const userPrincipal = `${uid('rb-user')}@example.com`;
  const role = 'viewer';

  // Register cleanup for the UI-added binding.
  api.onCleanup(async () => {
    await api.ctx.delete('/api/roles', {
      data: { user: userPrincipal, role },
    }).catch(() => undefined);
  });

  await loginAsAdmin(page, '/dashboard/policies');
  await expect(page.getByRole('heading', { name: 'Access Control' })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('tab', { name: 'Role Bindings' }).click();

  // Scope to the active tabpanel to avoid the getByLabel('Role') collision
  // with the tabpanel element itself.
  const panel = page.getByRole('tabpanel', { name: 'Role Bindings' });
  await expect(panel.getByText('Assign role to user')).toBeVisible();

  await panel.getByRole('textbox', { name: 'User' }).fill(userPrincipal);
  await panel.getByRole('textbox', { name: 'Role' }).fill(role);
  await panel.getByRole('button', { name: 'Assign' }).click();

  // Binding appears in the BindingsTable
  const main = page.getByRole('main');
  await expect(main.getByText(userPrincipal)).toBeVisible({ timeout: 10_000 });
  await expect(main.getByText(role)).toBeVisible();
  // Form fields cleared
  await expect(panel.getByRole('textbox', { name: 'User' })).toHaveValue('');
});
