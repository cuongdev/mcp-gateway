import { test, expect, loginAsAdmin } from './support/fixtures';
import { uid } from './support/api';

// Deep coverage for the Redaction feature — three tabs (Rules, Findings, Test
// playground), CRUD via both API seed and the "New custom rule" sheet, and
// the Test playground scan flow.

// ── Rules tab ────────────────────────────────────────────────────────────────

test('seeded custom rule appears in the Custom rules card', async ({ page, api }) => {
  const { name } = await api.createRedactionRule({
    name: uid('rule'),
    kind: 'custom',
    pattern: 'secret-\\d{4}',
    mode: 'redact',
  });
  await loginAsAdmin(page, '/dashboard/redaction');
  await expect(page.getByRole('heading', { name: 'Redaction' })).toBeVisible({ timeout: 10_000 });

  const main = page.getByRole('main');
  // The custom rules card must NOT show empty state
  await expect(main.getByText('No custom rules. Click "New custom rule" to add one.')).toBeHidden();
  // The rule name must appear in the list
  await expect(main.getByText(name)).toBeVisible();
});

test('create a custom rule through the New custom rule sheet', async ({ page, api }) => {
  const name = uid('rule-ui');
  // Register cleanup because the rule is created via UI, not the typed helper.
  api.onCleanup(async () => {
    const { rules } = await api.get<{ rules: Array<{ id: string; name: string }> }>('/api/redaction/rules');
    const created = rules.find((r) => r.name === name);
    if (created) await api.del(`/api/redaction/rules/${encodeURIComponent(created.id)}`);
  });

  await loginAsAdmin(page, '/dashboard/redaction');
  await expect(page.getByRole('heading', { name: 'Redaction' })).toBeVisible({ timeout: 10_000 });

  // Open the sheet
  await page.getByRole('button', { name: 'New custom rule' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'New custom redaction rule' })).toBeVisible();

  // The form inputs are identified by placeholder (the Labels are not
  // associated via htmlFor, so getByLabel does not resolve them).
  await dialog.getByPlaceholder('My internal API token').fill(name);
  await dialog.getByPlaceholder('^secret_[A-Za-z0-9]{16}$').fill('tok-[a-z0-9]{8}');

  // Mode defaults to Redact — switch to Warn to exercise the select. The
  // option text in the dropdown is the full label.
  await dialog.getByRole('combobox').click();
  await page.getByRole('option', { name: /Warn/i }).click();

  await dialog.getByRole('button', { name: 'Create' }).click();

  // Sheet should close after successful creation
  await expect(page.getByRole('heading', { name: 'New custom redaction rule' })).toBeHidden();
  // The new rule appears in the Custom rules card
  await expect(page.getByRole('main').getByText(name)).toBeVisible({ timeout: 10_000 });
});

test('Rules tab shows Built-in rules section header', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/redaction');
  await expect(page.getByRole('heading', { name: 'Redaction' })).toBeVisible({ timeout: 10_000 });
  // The built-in card heading is always present regardless of count
  await expect(page.getByRole('main').getByText(/Built-in rules/)).toBeVisible();
});

// ── Findings tab ─────────────────────────────────────────────────────────────

test('Findings tab renders stat cards and filter controls', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/redaction');
  await expect(page.getByRole('heading', { name: 'Redaction' })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('tab', { name: 'Findings' }).click();
  const main = page.getByRole('main');

  // Stat cards — always rendered with real API values
  await expect(main.getByText('Findings 24h')).toBeVisible();
  await expect(main.getByText('Top rule')).toBeVisible();
  await expect(main.getByText('Top server')).toBeVisible();

  // Filter row — the Server input placeholder "github" is a substring of the
  // Rule-id placeholder "github_pat", so the Server input needs exact matching.
  await expect(main.getByPlaceholder('github', { exact: true })).toBeVisible();
  await expect(main.getByPlaceholder('github_pat')).toBeVisible();
  // Scope combobox rendered
  await expect(main.getByRole('combobox')).toBeVisible();
});

test('Findings tab shows empty state when server filter has no matches', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/redaction');
  await expect(page.getByRole('heading', { name: 'Redaction' })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('tab', { name: 'Findings' }).click();
  const main = page.getByRole('main');

  // Type something that will never match a server name (Server input, exact
  // placeholder to avoid colliding with the "github_pat" Rule-id input).
  await main.getByPlaceholder('github', { exact: true }).fill('zzz-no-server-exists-xyz');
  // The findings list shows a "Loading…" state until the query resolves; allow a
  // generous timeout so the empty state is reliable under slow CI runners.
  await expect(main.getByText('No findings match the current filters.')).toBeVisible({ timeout: 15_000 });
});

// ── Test playground tab ───────────────────────────────────────────────────────

test('playground scans the pre-filled sample text and renders redacted output', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/redaction');
  await expect(page.getByRole('heading', { name: 'Redaction' })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('tab', { name: /Test playground/i }).click();

  // The textarea is pre-filled with the SAMPLE constant
  const textarea = page.locator('textarea');
  await expect(textarea).toBeVisible();
  await expect(textarea).not.toBeEmpty();

  await page.getByRole('button', { name: 'Scan' }).click();

  // After scan, the Redacted output section must appear
  await expect(page.getByText('Redacted output')).toBeVisible({ timeout: 10_000 });
});

test('playground with a seeded custom rule matches custom input text', async ({ page, api }) => {
  await api.createRedactionRule({
    name: uid('pg-rule'),
    kind: 'custom',
    pattern: 'PLAYGROUND_SECRET_\\d+',
    mode: 'redact',
  });

  await loginAsAdmin(page, '/dashboard/redaction');
  await expect(page.getByRole('heading', { name: 'Redaction' })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('tab', { name: /Test playground/i }).click();

  const textarea = page.locator('textarea');
  await textarea.fill('token=PLAYGROUND_SECRET_9999 is used here');

  await page.getByRole('button', { name: 'Scan' }).click();

  // The matched-count badge (e.g. "1 rule matched") must appear
  await expect(page.getByText(/\d+ rule.* matched/)).toBeVisible({ timeout: 10_000 });
  // Redacted output section must appear
  await expect(page.getByText('Redacted output')).toBeVisible();
});

test('playground Scope selector switches between Request and Response', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/redaction');
  await expect(page.getByRole('heading', { name: 'Redaction' })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('tab', { name: /Test playground/i }).click();

  // The scope combobox is visible next to the Scan button
  const scopeCombo = page.getByRole('main').getByRole('combobox');
  await expect(scopeCombo).toBeVisible();
  await scopeCombo.click();
  await expect(page.getByRole('option', { name: 'Response' })).toBeVisible();
  await page.getByRole('option', { name: 'Response' }).click();

  // Scan still succeeds after scope change
  await page.getByRole('button', { name: 'Scan' }).click();
  await expect(page.getByText('Redacted output')).toBeVisible({ timeout: 10_000 });
});
