import type { Client } from '@libsql/client';

export interface WebhookDeliveryRow {
  id: string;
  webhookId: string;
  event: string;
  payloadJson: string;
  statusCode: number | null;
  attempts: number;
  nextRetryAt: number | null;
  deliveredAt: number | null;
  error: string | null;
}

export class WebhookDeliveryRepo {
  constructor(protected readonly client: Client) {}

  async enqueue(input: { id: string; webhookId: string; event: string; payloadJson: string }): Promise<void> {
    await this.client.execute({
      sql: `INSERT INTO webhook_deliveries(id, webhook_id, event, payload_json, attempts, next_retry_at)
            VALUES (?, ?, ?, ?, 0, ?)`,
      args: [input.id, input.webhookId, input.event, input.payloadJson, Date.now()],
    });
  }

  async claimDue(asOf: number, limit = 10): Promise<WebhookDeliveryRow[]> {
    const r = await this.client.execute({
      sql: `SELECT id, webhook_id, event, payload_json, status_code, attempts, next_retry_at, delivered_at, error
            FROM webhook_deliveries
            WHERE delivered_at IS NULL AND next_retry_at IS NOT NULL AND next_retry_at <= ?
            ORDER BY next_retry_at ASC LIMIT ?`,
      args: [asOf, limit],
    });
    return r.rows.map(rowToDelivery);
  }

  async markDelivered(id: string, statusCode: number): Promise<void> {
    await this.client.execute({
      sql: `UPDATE webhook_deliveries
            SET status_code = ?, delivered_at = ?, next_retry_at = NULL, error = NULL
            WHERE id = ?`,
      args: [statusCode, Date.now(), id],
    });
  }

  async markRetry(id: string, attempts: number, nextRetryAt: number, error: string, statusCode: number | null): Promise<void> {
    await this.client.execute({
      sql: `UPDATE webhook_deliveries
            SET attempts = ?, next_retry_at = ?, error = ?, status_code = ?
            WHERE id = ?`,
      args: [attempts, nextRetryAt, error, statusCode, id],
    });
  }

  async markFailed(id: string, attempts: number, error: string, statusCode: number | null): Promise<void> {
    await this.client.execute({
      sql: `UPDATE webhook_deliveries
            SET attempts = ?, next_retry_at = NULL, error = ?, status_code = ?
            WHERE id = ?`,
      args: [attempts, error, statusCode, id],
    });
  }

  async listForWebhook(webhookId: string, limit = 50): Promise<WebhookDeliveryRow[]> {
    const r = await this.client.execute({
      sql: `SELECT id, webhook_id, event, payload_json, status_code, attempts, next_retry_at, delivered_at, error
            FROM webhook_deliveries WHERE webhook_id = ? ORDER BY id DESC LIMIT ?`,
      args: [webhookId, limit],
    });
    return r.rows.map(rowToDelivery);
  }
}

function rowToDelivery(r: Record<string, unknown>): WebhookDeliveryRow {
  return {
    id: r.id as string,
    webhookId: r.webhook_id as string,
    event: r.event as string,
    payloadJson: r.payload_json as string,
    statusCode: r.status_code === null ? null : Number(r.status_code),
    attempts: Number(r.attempts),
    nextRetryAt: r.next_retry_at === null ? null : Number(r.next_retry_at),
    deliveredAt: r.delivered_at === null ? null : Number(r.delivered_at),
    error: (r.error as string | null) ?? null,
  };
}
