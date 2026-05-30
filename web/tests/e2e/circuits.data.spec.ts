import { test, expect, loginAsAdmin } from './support/fixtures';

// Deeper coverage for the Circuits page (Reliability group).
//
// IMPORTANT — how circuits are derived, and the contamination hazard:
//
//  * Circuits live in an in-memory state machine, NOT in the server table.
//    Registering a server via `api.createServer()` does NOT create a circuit
//    card — the breaker entry only materialises once the gateway records a
//    call or an admin mutates it (trip/close/reset).  So to get a deterministic
//    visible card we TRIP the circuit via the API first.
//
//  * The state machine has NO "forget" operation: once an entry exists it lives
//    for the gateway's lifetime, and `createServer()` cleanup only deletes the
//    server row — the breaker entry survives.  A lingering `circuit_open` card
//    for a now-deleted server crashes the Circuits page on later specs (this is
//    what regressed circuits.smoke / nav).  A lingering *healthy* card is
//    benign — it renders fine and the smoke spec only asserts the filter chips.
//
//  FIX: every test that trips a circuit registers an `onCleanup` that CLOSES it
//  back to healthy.  Cleanups run LIFO, so the close runs BEFORE the server
//  delete, leaving only a benign healthy entry (or none).  This keeps the
//  gateway in a clean, non-crashing state for the specs that run afterwards.

/** Trip a circuit and guarantee it is closed back to healthy before teardown. */
async function tripCleanly(
  api: { post: (p: string, b?: unknown) => Promise<unknown>; onCleanup: (fn: () => Promise<void>) => void },
  name: string,
): Promise<void> {
  api.onCleanup(async () => {
    await api.post(`/api/circuits/${encodeURIComponent(name)}/close`, { reason: 'e2e cleanup' }).catch(() => undefined);
  });
  await api.post(`/api/circuits/${encodeURIComponent(name)}/trip`, { reason: 'e2e' });
}

test('GET /api/circuits returns the expected shape after a trip', async ({ api }) => {
  const { name } = await api.createServer({ path: '/fs' });
  await tripCleanly(api, name);

  const data = await api.get<{ circuits: Array<{ serverName: string; state: string; config: unknown; rolling?: unknown }> }>(
    '/api/circuits',
  );
  expect(Array.isArray(data.circuits)).toBe(true);
  const ours = data.circuits.find((c) => c.serverName === name);
  expect(ours).toBeDefined();
  expect(ours!.state).toBe('circuit_open');
  expect(ours!.config).toBeTruthy();
});

test('a tripped server shows a circuit card on the Circuits page', async ({ page, api }) => {
  const { name } = await api.createServer({ path: '/fs' });
  await tripCleanly(api, name);

  await loginAsAdmin(page, '/dashboard/circuits');
  await expect(page.getByRole('heading', { name: 'Circuits' })).toBeVisible({ timeout: 10_000 });

  // Empty-state must NOT be shown — there is at least one circuit.
  await expect(page.getByText('No circuits tracked')).toBeHidden();

  // The circuit card for the tripped server is visible.
  const main = page.getByRole('main');
  await expect(main.getByText(name)).toBeVisible();
});

test('circuit card shows the open state badge for a tripped server', async ({ page, api }) => {
  const { name } = await api.createServer({ path: '/fs' });
  await tripCleanly(api, name);

  await loginAsAdmin(page, '/dashboard/circuits');
  await expect(page.getByRole('heading', { name: 'Circuits' })).toBeVisible({ timeout: 10_000 });

  // A tripped server renders a "circuit open" badge on its card.
  const main = page.getByRole('main');
  await expect(main.getByText('circuit open').first()).toBeVisible({ timeout: 8_000 });
});

test('filter chips render with counts on a populated page', async ({ page, api }) => {
  const { name } = await api.createServer({ path: '/fs' });
  await tripCleanly(api, name);

  await loginAsAdmin(page, '/dashboard/circuits');
  await expect(page.getByRole('heading', { name: 'Circuits' })).toBeVisible({ timeout: 10_000 });

  await expect(page.getByRole('button', { name: /^All\b/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Open\b/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Healthy\b/ })).toBeVisible();
});

test('clicking the Open filter shows the tripped circuit', async ({ page, api }) => {
  const { name } = await api.createServer({ path: '/fs' });
  await tripCleanly(api, name);

  await loginAsAdmin(page, '/dashboard/circuits');
  await expect(page.getByRole('heading', { name: 'Circuits' })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: /^Open\b/ }).click();
  // The tripped server stays visible under the Open filter; empty-state hidden.
  const main = page.getByRole('main');
  await expect(main.getByText(name)).toBeVisible();
  await expect(page.getByText('No circuit open circuits')).toBeHidden();
});

test('clicking Details opens the circuit detail sheet', async ({ page, api }) => {
  const { name } = await api.createServer({ path: '/fs' });
  await tripCleanly(api, name);

  await loginAsAdmin(page, '/dashboard/circuits');
  await expect(page.getByRole('heading', { name: 'Circuits' })).toBeVisible({ timeout: 10_000 });

  // Each card has a "Details" button (ghost variant).
  await page.getByRole('button', { name: /Details/ }).first().click();

  // The sheet opens with the server name as the title and the description.
  await expect(page.getByText('Circuit breaker details and configuration')).toBeVisible();
  await expect(page.getByText(name).first()).toBeVisible();
});

test('detail sheet shows state, config fields and action buttons', async ({ page, api }) => {
  const { name } = await api.createServer({ path: '/fs' });
  await tripCleanly(api, name);

  // Navigate directly to the detail sheet URL.
  await loginAsAdmin(page, `/dashboard/circuits/${encodeURIComponent(name)}`);
  // Scope everything to the detail sheet — the list page renders behind it and
  // accumulates circuits from earlier tests, so unscoped text/buttons collide.
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Circuit breaker details and configuration')).toBeVisible({ timeout: 10_000 });

  // State section.
  await expect(dialog.getByText('Current state')).toBeVisible();
  // Config section labels (each appears as both a display row and an edit label).
  await expect(dialog.getByText('Error rate threshold').first()).toBeVisible();
  await expect(dialog.getByText('Window size').first()).toBeVisible();
  await expect(dialog.getByText('Cooldown ms').first()).toBeVisible();
  // Manual actions section.
  await expect(dialog.getByText('Manual actions')).toBeVisible();
  // The circuit is open, so a "Close" action is offered and "Reset counters" too.
  // .first() targets the manual action button (the Sheet's built-in X close,
  // rendered after the content, also has the accessible name "Close").
  await expect(dialog.getByRole('button', { name: 'Close' }).first()).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Reset counters' })).toBeVisible();
});

test('detail sheet of a tripped circuit shows the circuit open state', async ({ page, api }) => {
  const { name } = await api.createServer({ path: '/fs' });
  await tripCleanly(api, name);

  await loginAsAdmin(page, `/dashboard/circuits/${encodeURIComponent(name)}`);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Circuit breaker details and configuration')).toBeVisible({ timeout: 10_000 });

  // The state badge reflects the tripped (circuit open) state.
  await expect(dialog.getByText('circuit open').first()).toBeVisible({ timeout: 8_000 });
});

test('closing an open circuit from the detail sheet returns it to healthy', async ({ page, api }) => {
  const { name } = await api.createServer({ path: '/fs' });
  await tripCleanly(api, name);

  await loginAsAdmin(page, `/dashboard/circuits/${encodeURIComponent(name)}`);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Circuit breaker details and configuration')).toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByText('circuit open').first()).toBeVisible({ timeout: 8_000 });

  // Click the manual Close action (.first(); the Sheet's X close also matches).
  await dialog.getByRole('button', { name: 'Close' }).first().click();

  await expect(dialog.getByText('healthy').first()).toBeVisible({ timeout: 8_000 });
  // Once healthy, a "Trip" button is offered and "Close" disappears.
  await expect(dialog.getByRole('button', { name: 'Trip' })).toBeVisible({ timeout: 8_000 });
});

test('resetting a tripped circuit returns it to healthy', async ({ page, api }) => {
  const { name } = await api.createServer({ path: '/fs' });
  await tripCleanly(api, name);

  await loginAsAdmin(page, `/dashboard/circuits/${encodeURIComponent(name)}`);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Circuit breaker details and configuration')).toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByText('circuit open').first()).toBeVisible({ timeout: 8_000 });

  // Click "Reset counters" — opens a ConfirmDestructive alert dialog whose
  // confirm button is labelled "Delete" (the component's default).
  await dialog.getByRole('button', { name: 'Reset counters' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();

  // After reset the circuit returns to healthy.
  await expect(dialog.getByText('healthy').first()).toBeVisible({ timeout: 8_000 });
});

test('circuit card Close button on the list page closes the circuit inline', async ({ page, api }) => {
  const { name } = await api.createServer({ path: '/fs' });
  await tripCleanly(api, name);

  await loginAsAdmin(page, '/dashboard/circuits');
  await expect(page.getByRole('heading', { name: 'Circuits' })).toBeVisible({ timeout: 10_000 });

  // A tripped card offers a "Close" button.
  const main = page.getByRole('main');
  await expect(main.getByText(name)).toBeVisible();
  await main.getByRole('button', { name: 'Close' }).first().click();

  // After closing, the card badge transitions to healthy and "Trip" appears.
  await expect(main.getByText('healthy').first()).toBeVisible({ timeout: 8_000 });
  await expect(main.getByRole('button', { name: /Trip/ }).first()).toBeVisible({ timeout: 8_000 });
});
