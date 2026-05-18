import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { context, trace } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { withSpan, currentTraceparent } from '../../src/observability/spans.js';

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
});
