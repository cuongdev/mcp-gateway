import { test, expect, loginAsAdmin } from './support/fixtures';
import { uid } from './support/api';

// Full CRUD coverage for Webhooks — seed via API → assert card renders,
// create via UI new-sheet (name/url/events) → assert card, delete via the
// ConfirmDestructive button. All data cleaned up by the `api` fixture.

test('seeded webhook renders as a card', async ({ page, api }) => {
  const name = uid('wh');
  await api.createWebhook({
    name,
    url: 'https://example.com/hook',
    events: ['tool.call'],
  });

  await loginAsAdmin(page, '/dashboard/webhooks');
  await expect(page.getByRole('heading', { name: 'Webhooks' })).toBeVisible({ timeout: 10_000 });

  const main = page.getByRole('main');
  // Card shows the webhook name and its URL
  await expect(main.getByText(name)).toBeVisible();
  await expect(main.getByText('https://example.com/hook')).toBeVisible();
  // Events badge renders
  await expect(main.getByText('tool.call')).toBeVisible();
  // enabled badge
  await expect(main.getByText('enabled').first()).toBeVisible();
  // No-HMAC signing label
  await expect(main.getByText('No HMAC signing')).toBeVisible();
  // Empty-state should not be shown
  await expect(main.getByText('No webhooks yet')).toBeHidden();
});

test('seeded webhook with secret shows HMAC signing enabled', async ({ page, api }) => {
  const name = uid('wh-hmac');
  await api.createWebhook({
    name,
    url: 'https://example.com/signed',
    events: ['tool.call'],
    secret: 'supersecret',
  });

  await loginAsAdmin(page, '/dashboard/webhooks');
  await expect(page.getByRole('heading', { name: 'Webhooks' })).toBeVisible({ timeout: 10_000 });

  const main = page.getByRole('main');
  await expect(main.getByText(name)).toBeVisible();
  await expect(main.getByText('HMAC signing enabled')).toBeVisible();
});

test('create a webhook through the New Webhook sheet', async ({ page, api }) => {
  const name = uid('wh-ui');
  const webhookUrl = 'https://example.com/e2e-hook';

  // Register cleanup for the UI-created webhook
  api.onCleanup(async () => {
    const { webhooks } = await api.get<{ webhooks: Array<{ id: string; name: string }> }>('/api/webhooks');
    const created = webhooks.find((w) => w.name === name);
    if (created) await api.del(`/api/webhooks/${encodeURIComponent(created.id)}`);
  });

  await loginAsAdmin(page, '/dashboard/webhooks');
  await expect(page.getByRole('heading', { name: 'Webhooks' })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'New Webhook' }).first().click();
  await expect(page.getByRole('heading', { name: 'Create Webhook' })).toBeVisible();

  await page.getByLabel('Name').fill(name);
  await page.getByLabel('URL').fill(webhookUrl);

  // Add an event via the ChipInput — type the event name and press Enter
  const eventsInput = page.getByRole('textbox', { name: 'events' });
  await eventsInput.fill('tool.call');
  await eventsInput.press('Enter');

  await page.getByRole('button', { name: 'Create' }).click();

  // Sheet closes and the new card renders
  await expect(page.getByRole('heading', { name: 'Create Webhook' })).toBeHidden();
  const main = page.getByRole('main');
  await expect(main.getByText(name)).toBeVisible();
  await expect(main.getByText(webhookUrl)).toBeVisible();
  await expect(main.getByText('tool.call')).toBeVisible();
});

test('delete a webhook via the destructive confirm button', async ({ page, api }) => {
  const name = uid('wh-del');
  // api fixture will also try cleanup; the onCleanup below is a no-op if already deleted.
  await api.createWebhook({ name, url: 'https://example.com/delete-me', events: ['tool.call'] });

  await loginAsAdmin(page, '/dashboard/webhooks');
  await expect(page.getByRole('heading', { name: 'Webhooks' })).toBeVisible({ timeout: 10_000 });

  const main = page.getByRole('main');
  await expect(main.getByText(name)).toBeVisible();

  // Click the trash icon button for this webhook's card
  await main.getByRole('button', { name: 'Delete webhook' }).click();

  // ConfirmDestructive dialog appears — click the "Delete" confirm button
  await expect(page.getByRole('alertdialog').or(page.getByRole('dialog')).getByRole('button', { name: 'Delete' })).toBeVisible();
  await page.getByRole('alertdialog').or(page.getByRole('dialog')).getByRole('button', { name: 'Delete' }).click();

  // Card is removed; empty state may appear if no other webhooks remain
  await expect(main.getByText(name)).toBeHidden({ timeout: 10_000 });
});
