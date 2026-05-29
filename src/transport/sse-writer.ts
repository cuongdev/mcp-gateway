// ============================================================
// SseWriter — minimal SSE frame writer abstraction
//
// Each call to `send()` writes a single `data: <json>\n\n`
// frame on the underlying stream. Used by the ReverseChannelMux
// to push server-initiated JSON-RPC requests (sampling,
// roots, resources/updated) to a connected MCP client over
// the GET /mcp SSE long-poll.
//
// We intentionally avoid baking Hono types into the public
// interface so tests can plug a plain mock writer.
// ============================================================

import type { SSEStreamingApi } from 'hono/streaming';

export interface SseWriter {
  /**
   * Serialise `json` and emit a single SSE frame.
   *
   * `opts.event` sets the SSE `event:` field so a client can route frames
   * without inspecting their JSON body. Reverse JSON-RPC frames use the
   * default `message` event (delivered to `EventSource.onmessage`);
   * keep-alive heartbeats use a distinct event so they're never confused
   * with a real reverse request.
   */
  send(json: unknown, opts?: { event?: string }): void;
  /** Mark the channel closed. Subsequent `send()` calls become no-ops. */
  close(): void;
  /** True once `close()` has been called or the underlying stream ended. */
  readonly closed: boolean;
}

/**
 * Wrap a Hono `SSEStreamingApi` into an `SseWriter`. The Hono helper
 * exposes `writeSSE({ data })` which yields `event:` / `data:` lines;
 * we always set `data` to the JSON-stringified payload and rely on
 * Hono to terminate the frame with the required blank line.
 *
 * `writeSSE` is async (it awaits the underlying writable stream's
 * backpressure handle). We deliberately fire-and-forget the promise
 * inside `send()` so callers stay synchronous; any write error
 * latches `closed = true` and is logged via the optional `onError`.
 */
export class HonoSseWriter implements SseWriter {
  private _closed = false;
  constructor(
    private readonly stream: SSEStreamingApi,
    private readonly onError?: (err: unknown) => void,
  ) {}

  get closed(): boolean {
    return this._closed;
  }

  send(json: unknown, opts?: { event?: string }): void {
    if (this._closed) return;
    let payload: string;
    try {
      payload = JSON.stringify(json);
    } catch (err) {
      // Don't crash the stream on a serialisation bug — log + skip frame.
      this.onError?.(err);
      return;
    }
    // Hono's writeSSE returns a Promise; we don't await because send()
    // is sync by contract. Any rejection latches the writer closed so
    // the mux's pendingCountFor reflects reality.
    const frame = opts?.event ? { event: opts.event, data: payload } : { data: payload };
    this.stream.writeSSE(frame).catch((err) => {
      this._closed = true;
      this.onError?.(err);
    });
  }

  close(): void {
    if (this._closed) return;
    this._closed = true;
    // The underlying Hono stream is closed by `streamSSE` when its
    // callback returns; we don't force-close here to avoid double-close.
  }
}
