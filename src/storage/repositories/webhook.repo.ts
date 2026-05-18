import type { Client } from '@libsql/client';

export interface WebhookRow {
  id: string;
  name: string;
  url: string;
  secret: string | null;
  events: string[];
  enabled: boolean;
  createdAt: number;
}

export class WebhookRepo {
  constructor(protected readonly client: Client) {}

  async create(input: { id: string; name: string; url: string; secret?: string; events: string[] }): Promise<WebhookRow> {
    const now = Date.now();
    await this.client.execute({
      sql: `INSERT INTO webhooks(id, name, url, secret, events, enabled, created_at)
            VALUES (?, ?, ?, ?, ?, 1, ?)`,
      args: [input.id, input.name, input.url, input.secret ?? null, JSON.stringify(input.events), now],
    });
    const row = await this.findById(input.id);
    if (!row) throw new Error('Failed to read back webhook');
    return row;
  }

  async findById(id: string): Promise<WebhookRow | null> {
    const r = await this.client.execute({
      sql: 'SELECT id, name, url, secret, events, enabled, created_at FROM webhooks WHERE id = ?',
      args: [id],
    });
    if (r.rows.length === 0) return null;
    return rowToWebhook(r.rows[0]);
  }

  async list(): Promise<WebhookRow[]> {
    const r = await this.client.execute('SELECT id, name, url, secret, events, enabled, created_at FROM webhooks ORDER BY created_at');
    return r.rows.map(rowToWebhook);
  }

  async listForEvent(event: string): Promise<WebhookRow[]> {
    const all = await this.list();
    return all.filter((w) => w.enabled && w.events.includes(event));
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    await this.client.execute({
      sql: 'UPDATE webhooks SET enabled = ? WHERE id = ?',
      args: [enabled ? 1 : 0, id],
    });
  }

  async delete(id: string): Promise<void> {
    await this.client.execute({ sql: 'DELETE FROM webhooks WHERE id = ?', args: [id] });
  }
}

function rowToWebhook(r: Record<string, unknown>): WebhookRow {
  return {
    id: r.id as string,
    name: r.name as string,
    url: r.url as string,
    secret: (r.secret as string | null) ?? null,
    events: JSON.parse(r.events as string),
    enabled: Number(r.enabled) === 1,
    createdAt: Number(r.created_at),
  };
}
