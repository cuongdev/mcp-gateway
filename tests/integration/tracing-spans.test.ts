import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { context, trace } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { withSpan, currentTraceparent } from '../../src/observability/spans.js';
import { createServer } from 'node:http';
import { SessionManager } from '../../src/session/session.manager.js';
import { SqliteAdapter } from '../../src/storage/sqlite.adapter.js';

// Use BasicTracerProvider directly instead of NodeSDK — within a single
// test process, NodeSDK's resource detector + register() chain is non-deterministic
// (and a no-op on second `register()` call). BasicTracerProvider is the
// minimal viable provider that wires our InMemorySpanExporter to the global API.
const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider();
provider.addSpanProcessor(new SimpleSpanProcessor(exporter));

const contextManager = new AsyncLocalStorageContextManager();

describe('OTel spans', () => {
  beforeAll(() => {
    contextManager.enable();
    context.setGlobalContextManager(contextManager);
    trace.setGlobalTracerProvider(provider);
  });

  afterAll(async () => {
    await provider.shutdown();
    contextManager.disable();
    context.disable();
    trace.disable();
  });

  it('withSpan records attributes + OK status on success', async () => {
    exporter.reset();

    const result = await withSpan(
      'test.op',
      { foo: 'bar', n: 42, flag: true, missing: undefined },
      async () => 'done',
    );

    expect(result).toBe('done');

    const spans = exporter.getFinishedSpans();
    const op = spans.find((s) => s.name === 'test.op');
    expect(op).toBeDefined();
    expect(op?.attributes['foo']).toBe('bar');
    expect(op?.attributes['n']).toBe(42);
    expect(op?.attributes['flag']).toBe(true);
    // undefined attrs are skipped
    expect(op?.attributes['missing']).toBeUndefined();
    // Status code 1 = OK in OTel SDK
    expect(op?.status.code).toBe(1);
  });

  it('withSpan records exception + ERROR status on rejection', async () => {
    exporter.reset();

    await expect(
      withSpan('test.fail', { kind: 'boom' }, async () => {
        throw new Error('kaboom');
      }),
    ).rejects.toThrow('kaboom');

    const spans = exporter.getFinishedSpans();
    const op = spans.find((s) => s.name === 'test.fail');
    expect(op).toBeDefined();
    // Status code 2 = ERROR
    expect(op?.status.code).toBe(2);
    expect(op?.status.message).toBe('kaboom');
    // Exception recorded as a span event
    const exceptionEvent = op?.events.find((e) => e.name === 'exception');
    expect(exceptionEvent).toBeDefined();
  });

  it('currentTraceparent returns a W3C-formatted header inside a span', async () => {
    exporter.reset();

    let tp: string | undefined;
    await withSpan('test.tp', {}, async () => {
      tp = currentTraceparent();
    });

    expect(tp).toBeDefined();
    // 00-<32 hex>-<16 hex>-<2 hex>
    expect(tp).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
  });

  it('storage.transaction wraps each transaction call in a span', async () => {
    exporter.reset();

    const storage = new SqliteAdapter({ url: ':memory:' });
    await storage.init();

    await storage.transaction(async (tx) => {
      await tx.query('SELECT 1');
    });

    const spans = exporter.getFinishedSpans();
    const txSpan = spans.find((s) => s.name === 'storage.transaction');
    expect(txSpan).toBeDefined();
    expect(txSpan?.attributes['storage.driver']).toBe('sqlite');
    // Status code 1 = OK
    expect(txSpan?.status.code).toBe(1);

    storage.close();
  });

  it('mcp.tools.discover span emitted when discoverTools is called', async () => {
    exporter.reset();

    // Spin up a minimal mock MCP server: responds to initialize + tools/list
    const server = createServer((req, res) => {
      let buf = '';
      req.on('data', (c) => (buf += c));
      req.on('end', () => {
        let body: { method?: string } = {};
        try { body = JSON.parse(buf); } catch { /* ignore */ }
        res.setHeader('content-type', 'application/json');
        if (body.method === 'initialize') {
          res.end(JSON.stringify({ result: { protocolVersion: '2024-11-05', capabilities: {} } }));
        } else if (body.method === 'tools/list') {
          res.end(JSON.stringify({ result: { tools: [{ name: 'echo', description: 'echoes' }] } }));
        } else {
          res.end(JSON.stringify({ result: {} }));
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as { port: number }).port;

    const mgr = new SessionManager();
    mgr.register('s', { type: 'streamable-http', url: `http://127.0.0.1:${port}/mcp` });

    await mgr.discoverTools('s');

    const spans = exporter.getFinishedSpans();
    const discoverSpan = spans.find((s) => s.name === 'mcp.tools.discover');
    expect(discoverSpan).toBeDefined();
    expect(discoverSpan?.attributes['server.name']).toBe('s');
    expect(discoverSpan?.attributes['tools.count']).toBe(1);
    expect(discoverSpan?.status.code).toBe(1);

    await new Promise<void>((r) => server.close(() => r()));
  });

  it('mcp.prompts.discover span emitted when discoverPrompts is called', async () => {
    exporter.reset();

    const server = createServer((req, res) => {
      let buf = '';
      req.on('data', (c) => (buf += c));
      req.on('end', () => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ result: { prompts: [{ name: 'greet', description: 'greeting' }] } }));
      });
    });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as { port: number }).port;

    const mgr = new SessionManager();
    mgr.register('s', { type: 'streamable-http', url: `http://127.0.0.1:${port}/mcp` });

    await mgr.discoverPrompts('s');

    const spans = exporter.getFinishedSpans();
    const discoverSpan = spans.find((s) => s.name === 'mcp.prompts.discover');
    expect(discoverSpan).toBeDefined();
    expect(discoverSpan?.attributes['server.name']).toBe('s');
    expect(discoverSpan?.attributes['prompts.count']).toBe(1);
    expect(discoverSpan?.status.code).toBe(1);

    await new Promise<void>((r) => server.close(() => r()));
  });
});
