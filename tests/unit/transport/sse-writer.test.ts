import { describe, it, expect, vi } from 'vitest';
import { HonoSseWriter } from '../../../src/transport/sse-writer.js';

/**
 * Minimal stand-in for hono/streaming's SSEStreamingApi: we only need
 * `writeSSE({ data })` to capture frames in test asserts. The other
 * fields (aborted/closed/onAbort) aren't exercised by the writer.
 */
function makeFakeStream(opts: { failOnWrite?: boolean } = {}) {
  const writes: Array<{ data: string }> = [];
  const writeSSE = vi.fn(async (msg: { data: string | Promise<string> }) => {
    if (opts.failOnWrite) {
      throw new Error('stream broken');
    }
    writes.push({ data: await msg.data });
  });
  return { writes, writeSSE };
}

describe('HonoSseWriter', () => {
  it('JSON-stringifies payloads and writes them through writeSSE', async () => {
    const stream = makeFakeStream();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const writer = new HonoSseWriter(stream as any);

    writer.send({ jsonrpc: '2.0', id: 1, method: 'ping' });
    writer.send({ type: 'heartbeat', ts: 42 });
    // writeSSE is async/fire-and-forget inside send(); let microtasks flush.
    await new Promise((r) => setTimeout(r, 0));

    expect(stream.writeSSE).toHaveBeenCalledTimes(2);
    expect(stream.writes).toEqual([
      { data: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) },
      { data: JSON.stringify({ type: 'heartbeat', ts: 42 }) },
    ]);
    expect(writer.closed).toBe(false);
  });

  it('marks closed on explicit close() and drops subsequent sends', async () => {
    const stream = makeFakeStream();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const writer = new HonoSseWriter(stream as any);
    writer.close();
    expect(writer.closed).toBe(true);
    writer.send({ ignored: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(stream.writeSSE).not.toHaveBeenCalled();
  });

  it('latches closed=true when the underlying writeSSE rejects', async () => {
    const stream = makeFakeStream({ failOnWrite: true });
    const onError = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const writer = new HonoSseWriter(stream as any, onError);
    writer.send({ foo: 'bar' });
    // Allow the rejection to propagate to .catch().
    await new Promise((r) => setTimeout(r, 0));
    expect(writer.closed).toBe(true);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('skips frames that JSON.stringify cannot serialise', async () => {
    const stream = makeFakeStream();
    const onError = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const writer = new HonoSseWriter(stream as any, onError);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    writer.send(circular);
    await new Promise((r) => setTimeout(r, 0));
    expect(stream.writeSSE).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    // Writer is NOT closed by a serialisation error — only by stream errors.
    expect(writer.closed).toBe(false);
  });
});
