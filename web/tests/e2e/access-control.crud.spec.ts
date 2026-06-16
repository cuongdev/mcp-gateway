import { test, expect, loginAsAdmin } from './support/fixtures';
import { uid, type SeedApi } from './support/api';

async function seedRealTool(api: SeedApi): Promise<string> {
  await api.createServer({ path: '/fs' });
  const { tools } = await api.get<{ tools: Array<{ name: string }> }>('/api/tools?all=true');
  return tools[0].name;
}

// Assign a role to a user from the User detail sheet (the "from the user end"
// improvement). Verifies the binding persists via /api/roles.
test('assign a role to a user from the user detail', async ({ page, api }) => {
  const user = await api.createUser({ email: `${uid('u')}@example.com` });
  api.onCleanup(async () => {
    await api.ctx.delete('/api/roles', { data: { user: user.email, role: 'analyst' } }).catch(() => undefined);
  });

  await loginAsAdmin(page, `/dashboard/users/${encodeURIComponent(user.id)}`);
  await expect(page.getByRole('dialog').getByText('Roles', { exact: true })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'analyst', exact: true }).click();

  await expect
    .poll(async () => {
      const { bindings } = await api.get<{ bindings: Array<{ user: string; role: string }> }>('/api/roles');
      return bindings.some((b) => b.user === user.email && b.role === 'analyst');
    }, { timeout: 8_000 })
    .toBe(true);
});

// Assign a user to a tool group DIRECTLY from the User detail (group.allowedUsers).
// Verifies the group's allowedUsers persists via /api/groups.
test('assign a user to a tool group directly from the user detail', async ({ page, api }) => {
  const tool = await seedRealTool(api);
  const grp = await api.createGroup({ name: uid('g'), tools: [tool] });
  const user = await api.createUser({ email: `${uid('u')}@example.com` });

  await loginAsAdmin(page, `/dashboard/users/${encodeURIComponent(user.id)}`);
  await expect(page.getByText('Tool groups (direct access)')).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: grp.name, exact: true }).click();

  await expect
    .poll(async () => {
      const { groups } = await api.get<{ groups: Array<{ name: string; allowedUsers: string[] }> }>('/api/groups');
      return groups.find((g) => g.name === grp.name)?.allowedUsers ?? [];
    }, { timeout: 8_000 })
    .toContain(user.email);
});

// Group allowedRoles now persists on edit (previously the PATCH dropped it).
test('group allowedRoles persists after editing in the detail sheet', async ({ page, api }) => {
  const tool = await seedRealTool(api);
  const grp = await api.createGroup({ name: uid('g'), tools: [tool] });

  await loginAsAdmin(page, `/dashboard/groups/${encodeURIComponent(grp.name)}`);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByRole('tab', { name: 'Roles' }).click();
  await dialog.getByRole('button', { name: 'analyst', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save changes' }).click();

  await expect
    .poll(async () => {
      const { group } = await api.get<{ group: { allowedRoles: string[] } }>(`/api/groups/${encodeURIComponent(grp.name)}`);
      return group.allowedRoles;
    }, { timeout: 8_000 })
    .toContain('analyst');
});
