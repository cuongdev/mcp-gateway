import { createHmac } from 'node:crypto';
import { newId } from '../utils/uuid.js';
import type { StorageAdapter } from '../storage/adapter.js';
import type { EventName } from './events.js';

export interface WebhookDispatcherConfig {
  enabled: boolean;
  workerPollIntervalMs: number;
  workerConcurrency: number;
  maxAttempts: number;
  backoffMs: number[];
}

export class WebhookDispatcher {
  private worker?: ReturnType<typeof setInterval>;

  constructor(
    private readonly storage: StorageAdapter,
    private readonly cfg: WebhookDispatcherConfig,
  ) {}

  async emit(event: EventName, payload: unknown): Promise<void> {
    if (!this.cfg.enabled) return;
    const webhooks = await this.storage.webhooks.listForEvent(event);
    const payloadJson = JSON.stringify({ event, ts: Date.now(), data: payload });
    for (const wh of webhooks) {
      await this.storage.webhookDeliveries.enqueue({
        id: `whd_${newId().slice(4)}`,
        webhookId: wh.id,
        event,
        payloadJson,
      });
    }
  }

  start(): void {
    if (!this.cfg.enabled || this.worker) return;
    this.worker = setInterval(() => {
      this.drainOnce().catch(() => {});
    }, this.cfg.workerPollIntervalMs);
    this.worker.unref?.();
  }

  stop(): void {
    if (this.worker) clearInterval(this.worker);
    this.worker = undefined;
  }

  async drainOnce(): Promise<number> {
    const due = await this.storage.webhookDeliveries.claimDue(Date.now(), this.cfg.workerConcurrency);
    let processed = 0;
    for (const d of due) {
      const wh = await this.storage.webhooks.findById(d.webhookId);
      if (!wh) {
        await this.storage.webhookDeliveries.markFailed(d.id, d.attempts + 1, 'webhook_not_found', null);
        processed++;
        continue;
      }
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (wh.secret) {
          const sig = createHmac('sha256', wh.secret).update(d.payloadJson).digest('hex');
          headers['X-MCP-Signature'] = `sha256=${sig}`;
        }
        const res = await fetch(wh.url, { method: 'POST', headers, body: d.payloadJson });
        if (res.ok) {
          await this.storage.webhookDeliveries.markDelivered(d.id, res.status);
        } else {
          const attempts = d.attempts + 1;
          if (attempts >= this.cfg.maxAttempts) {
            await this.storage.webhookDeliveries.markFailed(d.id, attempts, `http_${res.status}`, res.status);
          } else {
            const backoff = this.cfg.backoffMs[Math.min(attempts - 1, this.cfg.backoffMs.length - 1)];
            await this.storage.webhookDeliveries.markRetry(d.id, attempts, Date.now() + backoff, `http_${res.status}`, res.status);
          }
        }
      } catch (err) {
        const attempts = d.attempts + 1;
        const msg = (err as Error).message ?? 'fetch_failed';
        if (attempts >= this.cfg.maxAttempts) {
          await this.storage.webhookDeliveries.markFailed(d.id, attempts, msg, null);
        } else {
          const backoff = this.cfg.backoffMs[Math.min(attempts - 1, this.cfg.backoffMs.length - 1)];
          await this.storage.webhookDeliveries.markRetry(d.id, attempts, Date.now() + backoff, msg, null);
        }
      }
      processed++;
    }
    return processed;
  }
}
