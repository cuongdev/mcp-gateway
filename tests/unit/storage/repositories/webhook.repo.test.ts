import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../../src/storage/sqlite.adapter.js';

describe('WebhookRepo', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => { storage = await makeStorage(); });
  afterEach(async () => { await storage.close(); });

  it('create + findById round-trip', async () => {
    const w = await storage.webhooks.create({
      id: 'wh_1', name: 'slack', url: 'https://hooks.slack.com/x', secret: 's', events: ['approval.requested'],
    });
    expect(w.events).toEqual(['approval.requested']);
    expect(w.enabled).toBe(true);
  });

  it('listForEvent filters by event + enabled', async () => {
    await storage.webhooks.create({ id: 'wh_1', name: 'a', url: 'u', events: ['approval.requested'] });
    await storage.webhooks.create({ id: 'wh_2', name: 'b', url: 'u', events: ['tool.called'] });
    await storage.webhooks.create({ id: 'wh_3', name: 'c', url: 'u', events: ['approval.requested'] });
    await storage.webhooks.setEnabled('wh_3', false);

    const list = await storage.webhooks.listForEvent('approval.requested');
    expect(list.map((w) => w.id)).toEqual(['wh_1']);
  });

  it('delete removes the webhook', async () => {
    await storage.webhooks.create({ id: 'wh_1', name: 'a', url: 'u', events: [] });
    await storage.webhooks.delete('wh_1');
    expect(await storage.webhooks.findById('wh_1')).toBeNull();
  });
});
