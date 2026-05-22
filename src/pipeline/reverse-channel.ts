// ============================================================
// ReverseChannelMux — fan-in for upstream-initiated JSON-RPC
//
// MCP servers can initiate JSON-RPC requests back through the
// gateway (sampling/createMessage, roots/list, and resources
// change notifications). Those reverse RPCs must be routed to
// the *client* that owns the originating MCP session, then
// the client's response must be relayed back to the upstream.
//
// This module is the fan-in:
//   - clients register an SSE writer keyed by their session id
//   - upstream sessions call `forwardFromUpstream(...)` with
//     the JSON-RPC + the session id encoded in `_meta.session_id`
//   - the mux looks up the writer, pushes the frame, registers
//     a pending promise, and waits for the client to POST a
//     response that `resolveFromClient(requestId, response)`
//     plumbs back to the awaiting upstream
//
// Per-session backpressure (default 100 pending requests) keeps
// a single chatty upstream from exhausting memory. Per-request
// timeout (default 60s) prevents hung upstream connections.
//
// Session-ownership is enforced by the *caller*: the mux just
// records which session id owns each pending request. The
// HTTP route that accepts the client's response must compare
// the `Mcp-Session-Id` header to `pending.sessionId` before
// calling `resolveFromClient`.
// ============================================================

import type { SseWriter } from '../transport/sse-writer.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ component: 'reverse-channel-mux' });

/** Default per-call timeout in ms. */
const DEFAULT_TIMEOUT_MS = 60_000;

/** Default per-session backpressure cap. */
const DEFAULT_MAX_PENDING_PER_SESSION = 100;

export interface ReverseChannelMuxOptions {
  /** Per-call timeout (ms). Default 60_000. */
  defaultTimeoutMs?: number;
  /** Max pending requests per session before `backpressure` is thrown. Default 100. */
  maxPendingPerSession?: number;
}

/**
 * Error thrown by `forwardFromUpstream` when no client SSE channel is
 * registered for the target session id.
 */
export class ClientNotConnectedError extends Error {
  constructor(sessionId: string) {
    super(`client_not_connected: ${sessionId}`);
    this.name = 'ClientNotConnectedError';
  }
}

/**
 * Error thrown by `forwardFromUpstream` when the target session has
 * too many in-flight reverse calls.
 */
export class BackpressureError extends Error {
  constructor(sessionId: string, pending: number, limit: number) {
    super(`backpressure: session=${sessionId} pending=${pending} limit=${limit}`);
    this.name = 'BackpressureError';
  }
}

/**
 * Error thrown when a pending reverse call times out before the
 * client responds.
 */
export class ReverseChannelTimeoutError extends Error {
  constructor(requestId: string, timeoutMs: number) {
    super(`timeout: request_id=${requestId} after=${timeoutMs}ms`);
    this.name = 'ReverseChannelTimeoutError';
  }
}

/** Minimal JSON-RPC shape we need to forward. */
export interface ReverseJsonRpc {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

interface PendingEntry {
  resolve: (r: unknown) => void;
  reject: (e: Error) => void;
  timeout: NodeJS.Timeout;
  sessionId: string;
  upstreamServerName: string;
  startedAt: number;
}

export class ReverseChannelMux {
  /** sessionId → writer. */
  private clientChannels = new Map<string, SseWriter>();
  /** requestId (string) → pending entry. */
  private pending = new Map<string, PendingEntry>();
  /** sessionId → number of in-flight reverse calls (for backpressure). */
  private pendingPerSession = new Map<string, number>();

  private readonly defaultTimeoutMs: number;
  private readonly maxPendingPerSession: number;

  constructor(opts: ReverseChannelMuxOptions = {}) {
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxPendingPerSession = opts.maxPendingPerSession ?? DEFAULT_MAX_PENDING_PER_SESSION;
  }

  /**
   * Register a client SSE channel. The returned function un-registers
   * the channel and rejects every pending request for that session
   * with `client_disconnected`.
   */
  registerClient(sessionId: string, writer: SseWriter): () => void {
    // If a client reconnects with the same session id, evict the old writer
    // and fail its pending requests so the new connection starts clean.
    const prev = this.clientChannels.get(sessionId);
    if (prev && prev !== writer) {
      this.failAllForSession(sessionId, new Error('client_replaced'));
      try { prev.close(); } catch { /* never throw on close */ }
    }
    this.clientChannels.set(sessionId, writer);
    log.debug({ sessionId }, 'reverse channel client registered');
    return () => {
      // Only clear if the writer is still the same instance.
      if (this.clientChannels.get(sessionId) === writer) {
        this.clientChannels.delete(sessionId);
        this.failAllForSession(sessionId, new Error('client_disconnected'));
        log.debug({ sessionId }, 'reverse channel client unregistered');
      }
    };
  }

  /**
   * Forward a JSON-RPC reverse request from an upstream MCP server to
   * the client that owns `mcpSessionId`. Returns a promise that resolves
   * with the response the client POSTs back, or rejects on timeout /
   * disconnect / backpressure.
   *
   * The `jsonrpc.id` is coerced to a string and used as the requestId
   * key in the pending map. If two upstreams ever send the same id for
   * the same session, the second registration overwrites the first —
   * upstream session ids are expected to be unique per session.
   */
  async forwardFromUpstream(
    upstreamServerName: string,
    mcpSessionId: string,
    jsonrpc: ReverseJsonRpc,
    options?: { timeoutMs?: number },
  ): Promise<unknown> {
    const writer = this.clientChannels.get(mcpSessionId);
    if (!writer || writer.closed) {
      throw new ClientNotConnectedError(mcpSessionId);
    }

    const current = this.pendingPerSession.get(mcpSessionId) ?? 0;
    if (current >= this.maxPendingPerSession) {
      throw new BackpressureError(mcpSessionId, current, this.maxPendingPerSession);
    }

    const requestId = String(jsonrpc.id);
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;

    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const entry = this.pending.get(requestId);
        if (entry) {
          this.clearPending(requestId);
          entry.reject(new ReverseChannelTimeoutError(requestId, timeoutMs));
        }
      }, timeoutMs);
      // Don't keep the event loop alive solely for a reverse-channel timer.
      timeout.unref?.();

      this.pending.set(requestId, {
        resolve,
        reject,
        timeout,
        sessionId: mcpSessionId,
        upstreamServerName,
        startedAt: Date.now(),
      });
      this.pendingPerSession.set(mcpSessionId, current + 1);

      // Push the frame to the client. SseWriter.send is fire-and-forget;
      // a writer error latches `closed = true` and the next forward will
      // reject with `client_not_connected`.
      try {
        writer.send(jsonrpc);
      } catch (err) {
        this.clearPending(requestId);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /**
   * Called by the HTTP route that received the client's response to a
   * previously-forwarded reverse JSON-RPC. Returns `true` if a matching
   * pending entry was found and resolved, `false` if no match (orphan
   * response — possibly a duplicate or a too-late delivery).
   *
   * Session ownership: the calling route MUST verify that the responding
   * client's session id matches `pending.sessionId`. To make that
   * comparison cheap we expose `getPendingSessionId(requestId)`.
   */
  resolveFromClient(requestId: string, response: unknown): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;
    this.clearPending(requestId);
    entry.resolve(response);
    return true;
  }

  /** Look up which session owns a pending request (for the route to verify). */
  getPendingSessionId(requestId: string): string | undefined {
    return this.pending.get(requestId)?.sessionId;
  }

  /** Number of pending requests for a session (used for backpressure). */
  pendingCountFor(sessionId: string): number {
    return this.pendingPerSession.get(sessionId) ?? 0;
  }

  /** Total pending across all sessions + active channel count. */
  stats(): { activeClients: number; totalPending: number } {
    return {
      activeClients: this.clientChannels.size,
      totalPending: this.pending.size,
    };
  }

  /**
   * Convenience for tests / shutdown: reject every pending request for
   * a session with `reason`. Does NOT touch the writer (caller decides
   * whether to evict the SSE channel separately).
   */
  failAllForSession(sessionId: string, reason: Error): void {
    for (const [requestId, entry] of this.pending) {
      if (entry.sessionId !== sessionId) continue;
      this.clearPending(requestId);
      entry.reject(reason);
    }
  }

  /** Clear a pending entry + decrement the per-session counter. */
  private clearPending(requestId: string): void {
    const entry = this.pending.get(requestId);
    if (!entry) return;
    clearTimeout(entry.timeout);
    this.pending.delete(requestId);
    const remaining = (this.pendingPerSession.get(entry.sessionId) ?? 1) - 1;
    if (remaining <= 0) {
      this.pendingPerSession.delete(entry.sessionId);
    } else {
      this.pendingPerSession.set(entry.sessionId, remaining);
    }
  }
}
