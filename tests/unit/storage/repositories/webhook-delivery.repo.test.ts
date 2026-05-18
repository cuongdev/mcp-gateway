import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../../src/storage/sqlite.adapter.js';

describe('WebhookDeliveryRepo', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => {
    storage = await makeStorage();
    await storage.webhooks.create({ id: 'wh_1', name: 'a', url: 'u', events: ['e'] });
  });
  afterEach(async () => { await storage.close(); });

  it('claimDue returns enqueued items past next_retry_at', async () => {
    await storage.webhookDeliveries.enqueue({ id: 'd_1', webhookId: 'wh_1', event: 'e', payloadJson: '{}' });
    const due = await storage.webhookDeliveries.claimDue(Date.now() + 1000);
    expect(due.length).toBe(1);
  });

  it('markDelivered clears next_retry_at and sets delivered_at', async () => {
    await storage.webhookDeliveries.enqueue({ id: 'd_1', webhookId: 'wh_1', event: 'e', payloadJson: '{}' });
    await storage.webhookDeliveries.markDelivered('d_1', 200);
    const due = await storage.webhookDeliveries.claimDue(Date.now() + 1000);
    expect(due.length).toBe(0);
  });

  it('markRetry schedules next attempt', async () => {
    await storage.webhookDeliveries.enqueue({ id: 'd_1', webhookId: 'wh_1', event: 'e', payloadJson: '{}' });
    const future = Date.now() + 60_000;
    await storage.webhookDeliveries.markRetry('d_1', 1, future, 'http 500', 500);
    const dueNow = await storage.webhookDeliveries.claimDue(Date.now() + 1000);
    expect(dueNow.length).toBe(0);
    const dueFuture = await storage.webhookDeliveries.claimDue(future + 1000);
    expect(dueFuture.length).toBe(1);
  });
});
