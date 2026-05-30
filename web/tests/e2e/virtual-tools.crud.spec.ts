import { test, expect, loginAsAdmin } from './support/fixtures';
import { uid } from './support/api';

// Deeper Virtual Tools coverage: seed via API, create/validate/save via the
// JSON editor, assert list, and delete inline. Complements virtual-tools.smoke.spec.ts
// which only asserts the empty render + editor renders buttons.

// Minimal valid plan used throughout — a constant-output step requires no
// live upstream tools so it succeeds in the CI/dev environment.
function makePlan(name: string) {
  return {
    name,
    description: 'E2E created virtual tool',
    inputSchema: { type: 'object', properties: {}, required: [] },
    steps: [
      {
        id: 'step1',
        tool: 'noop__echo',
        args: { message: 'hello' },
      },
    ],
    output: { format: 'select', shape: '{{steps.step1}}' },
    errorPolicy: 'fail_fast',
  };
}

test('seeded virtual tool appears in the list', async ({ page, api }) => {
  const { name } = await api.createVirtualTool({ description: 'seeded vtool' });

  await loginAsAdmin(page, '/dashboard/virtual-tools');
  await expect(page.getByRole('heading', { name: 'Virtual Tools' })).toBeVisible({ timeout: 10_000 });

  const main = page.getByRole('main');
  await expect(main.getByText(name)).toBeVisible();
  // Description shown under the canonical name
  await expect(main.getByText('seeded vtool')).toBeVisible();
  // Error policy column
  await expect(main.getByText('fail_fast').first()).toBeVisible();
});

test('create a virtual tool via the JSON editor — validate then save', async ({ page, api }) => {
  const toolName = uid('vtool');
  const plan = makePlan(toolName);

  // Register cleanup before UI creates it.
  api.onCleanup(async () => {
    await api.del(`/api/virtual-tools/${encodeURIComponent(toolName)}`).catch(() => undefined);
  });

  await loginAsAdmin(page, '/dashboard/virtual-tools/new');
  await expect(page.getByRole('heading', { name: 'New virtual tool' })).toBeVisible({ timeout: 10_000 });

  // The editor is a plain <textarea> — fill() replaces the sample content.
  const textarea = page.getByRole('textbox');
  await textarea.fill(JSON.stringify(plan, null, 2));

  // Validate before saving — should show "valid" badge (exact match avoids the
  // "invalid" substring clash).
  await page.getByRole('button', { name: 'Validate' }).click();
  await expect(page.getByText('valid', { exact: true })).toBeVisible({ timeout: 8_000 });

  // Save — navigates back to the list on success.
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/\/dashboard\/virtual-tools$/);

  // Confirm new tool appears in the list.
  await expect(page.getByRole('main').getByText(toolName)).toBeVisible({ timeout: 8_000 });
});

test('clicking virtual tool name navigates to its editor', async ({ page, api }) => {
  const { name } = await api.createVirtualTool();

  await loginAsAdmin(page, '/dashboard/virtual-tools');
  await expect(page.getByRole('heading', { name: 'Virtual Tools' })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('main').getByText(name).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/virtual-tools/${encodeURIComponent(name)}`));
  // The editor for an existing tool shows its name as the page heading.
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name, { timeout: 8_000 });
});

test('validate invalid JSON plan shows invalid badge', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/virtual-tools/new');
  await expect(page.getByRole('heading', { name: 'New virtual tool' })).toBeVisible({ timeout: 10_000 });

  const textarea = page.getByRole('textbox');
  // fill() replaces the sample with a plan missing required fields.
  await textarea.fill(JSON.stringify({ name: 'bad', description: 'x' }, null, 2));

  await page.getByRole('button', { name: 'Validate' }).click();
  // Should surface an "invalid" badge (ok: false from the API).
  await expect(page.getByText('invalid', { exact: true })).toBeVisible({ timeout: 8_000 });
});
