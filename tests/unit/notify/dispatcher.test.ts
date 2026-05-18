import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { makeStorage } from '../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../src/storage/sqlite.adapter.js';
import { WebhookDispatcher } from '../../../src/notify/webhook.dispatcher.js';

async function startServer(handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void): Promise<{ server: Server; url: string }> {
  const server = createServer(handler);
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  return { server, url: `http://127.0.0.1:${port}` };
}

describe('WebhookDispatcher', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => { storage = await makeStorage(); });
  afterEach(async () => { await storage.close(); });

  it('emit + drainOnce delivers on 200', async () => {
    const received: string[] = [];
    const { server, url } = await startServer((req, res) => {
      let b = ''; req.on('data', (c) => b += c);
      req.on('end', () => { received.push(b); res.statusCode = 200; res.end('ok'); });
    });
    await storage.webhooks.create({ id: 'wh_1', name: 'a', url, events: ['approval.requested'] });
    const d = new WebhookDispatcher(storage, { enabled: true, workerPollIntervalMs: 1000, workerConcurrency: 4, maxAttempts: 5, backoffMs: [100] });
    await d.emit('approval.requested', { foo: 1 });
    expect(await d.drainOnce()).toBe(1);
    expect(received.length).toBe(1);
    server.close();
  });

  it('retries on 500 with backoff', async () => {
    const { server, url } = await startServer((_req, res) => { res.statusCode = 500; res.end('err'); });
    await storage.webhooks.create({ id: 'wh_1', name: 'a', url, events: ['approval.requested'] });
    const d = new WebhookDispatcher(storage, { enabled: true, workerPollIntervalMs: 1000, workerConcurrency: 4, maxAttempts: 3, backoffMs: [50, 50, 50] });
    await d.emit('approval.requested', { foo: 1 });
    await d.drainOnce();
    const all = await storage.webhookDeliveries.listForWebhook('wh_1');
    expect(all[0].attempts).toBe(1);
    expect(all[0].nextRetryAt).toBeGreaterThan(Date.now());
    server.close();
  });

  it('signs payload with X-MCP-Signature when secret set', async () => {
    let sig: string | undefined;
    const { server, url } = await startServer((req, res) => {
      sig = req.headers['x-mcp-signature'] as string | undefined;
      res.statusCode = 200; res.end('ok');
    });
    await storage.webhooks.create({ id: 'wh_1', name: 'a', url, secret: 'topsecret', events: ['approval.requested'] });
    const d = new WebhookDispatcher(storage, { enabled: true, workerPollIntervalMs: 1000, workerConcurrency: 4, maxAttempts: 3, backoffMs: [100] });
    await d.emit('approval.requested', { foo: 1 });
    await d.drainOnce();
    expect(sig).toMatch(/^sha256=[0-9a-f]+$/);
    server.close();
  });
});
