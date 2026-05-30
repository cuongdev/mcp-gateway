import { test, expect, loginAsAdmin } from './support/fixtures';

// Deeper coverage for the Cache page (Reliability group).
//
// The Cache page is a pure-action form — there is no seeded data to display.
// The meaningful tests here are:
//  1. Form fields are present and correctly labelled.
//  2. The Invalidate button is disabled while both fields are empty.
//  3. Filling only the Tool field enables the button and submitting it fires
//     the POST /api/cache/invalidate call, which returns and shows a toast.
//  4. Filling only the Principal field works the same way.
//  5. After a successful invalidation both fields are cleared.

test('Invalidate button is disabled when both fields are empty', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/cache');
  await expect(page.getByRole('heading', { name: 'Cache' })).toBeVisible({ timeout: 10_000 });

  const btn = page.getByRole('button', { name: 'Invalidate cache' });
  await expect(btn).toBeVisible();
  await expect(btn).toBeDisabled();
});

test('filling Tool field enables the Invalidate button', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/cache');
  await expect(page.getByRole('heading', { name: 'Cache' })).toBeVisible({ timeout: 10_000 });

  await page.getByLabel('Tool (canonical name)').fill('db__query');
  const btn = page.getByRole('button', { name: 'Invalidate cache' });
  await expect(btn).toBeEnabled();
});

test('filling Principal field enables the Invalidate button', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/cache');
  await expect(page.getByRole('heading', { name: 'Cache' })).toBeVisible({ timeout: 10_000 });

  await page.getByLabel('Principal ID').fill('usr_test123');
  const btn = page.getByRole('button', { name: 'Invalidate cache' });
  await expect(btn).toBeEnabled();
});

test('submitting with a tool name shows a success toast and clears the field', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/cache');
  await expect(page.getByRole('heading', { name: 'Cache' })).toBeVisible({ timeout: 10_000 });

  const toolInput = page.getByLabel('Tool (canonical name)');
  await toolInput.fill('read_file');
  await page.getByRole('button', { name: 'Invalidate cache' }).click();

  // The API responds with { ok: true, invalidated: N } — the toast says
  // "Invalidated N cache entr(y|ies)".
  await expect(page.getByText(/Invalidated \d+ cache entr/)).toBeVisible({ timeout: 8_000 });

  // After success both fields are cleared (UX: tool input goes back to empty).
  await expect(toolInput).toHaveValue('');
});

test('submitting with a principal ID shows a success toast', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/cache');
  await expect(page.getByRole('heading', { name: 'Cache' })).toBeVisible({ timeout: 10_000 });

  await page.getByLabel('Principal ID').fill('sa_dev');
  await page.getByRole('button', { name: 'Invalidate cache' }).click();

  await expect(page.getByText(/Invalidated \d+ cache entr/)).toBeVisible({ timeout: 8_000 });
});

test('page subtitle and card heading are correct', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/cache');
  await expect(page.getByRole('heading', { name: 'Cache' })).toBeVisible({ timeout: 10_000 });

  await expect(page.getByText('Invalidate cached tool-call responses')).toBeVisible();
  // Card heading contains "Invalidate" text.
  await expect(page.getByText('Invalidate').first()).toBeVisible();
  await expect(page.getByText(/Specify a canonical tool name/)).toBeVisible();
});
