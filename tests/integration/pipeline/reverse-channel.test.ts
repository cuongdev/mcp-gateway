import { describe, it, expect, vi } from 'vitest';
import {
  ReverseChannelMux,
  ClientNotConnectedError,
  BackpressureError,
  ReverseChannelTimeoutError,
} from '../../../src/pipeline/reverse-channel.js';
import type { SseWriter } from '../../../src/transport/sse-writer.js';

/** Captures everything sent to the writer for assertion. */
function makeMockWriter(): SseWriter & { sent: unknown[] } {
  const sent: unknown[] = [];
  let _closed = false;
  return {
    sent,
    get closed() {
      return _closed;
    },
    send(json: unknown) {
      if (_closed) return;
      sent.push(json);
    },
    close() {
      _closed = true;
    },
  };
}

const baseRpc = (id: string | number, method = 'sampling/createMessage') => ({
  jsonrpc: '2.0' as const,
  id,
  method,
  params: { _meta: { session_id: 's1' }, messages: [] },
});

describe('ReverseChannelMux', () => {
  it('round-trips a forwardFromUpstream → client SSE write → resolveFromClient', async () => {
    const mux = new ReverseChannelMux();
    const writer = makeMockWriter();
    mux.registerClient('s1', writer);

    const upstreamPromise = mux.forwardFromUpstream('srv-a', 's1', baseRpc('r1'));

    // The frame should land on the client writer immediately.
    expect(writer.sent).toHaveLength(1);
    expect(writer.sent[0]).toMatchObject({ id: 'r1', method: 'sampling/createMessage' });
    expect(mux.pendingCountFor('s1')).toBe(1);
    expect(mux.stats()).toEqual({ activeClients: 1, totalPending: 1 });

    // Client replies with a JsonRpcResponse.
    const clientResponse = { jsonrpc: '2.0', id: 'r1', result: { ok: true } };
    const ok = mux.resolveFromClient('r1', 's1', clientResponse);
    expect(ok).toBe(true);

    const resolved = await upstreamPromise;
    expect(resolved).toEqual(clientResponse);
    expect(mux.pendingCountFor('s1')).toBe(0);
    expect(mux.stats()).toEqual({ activeClients: 1, totalPending: 0 });
  });

  it('returns false for orphan resolveFromClient (no matching pending)', () => {
    const mux = new ReverseChannelMux();
    expect(mux.resolveFromClient('does-not-exist', 's1', { jsonrpc: '2.0', id: 'x', result: 1 })).toBe(false);
  });

  it('exposes the owning session id for a pending request (used to enforce session binding)', async () => {
    const mux = new ReverseChannelMux();
    const writer = makeMockWriter();
    mux.registerClient('s1', writer);
    const p = mux.forwardFromUpstream('srv', 's1', baseRpc('rB'));
    expect(mux.getPendingSessionId('rB')).toBe('s1');
    mux.resolveFromClient('rB', 's1', { jsonrpc: '2.0', id: 'rB', result: 'k' });
    await p;
    expect(mux.getPendingSessionId('rB')).toBeUndefined();
  });

  it('rejects with timeout error when no client response arrives within timeoutMs', async () => {
    vi.useFakeTimers();
    try {
      const mux = new ReverseChannelMux();
      const writer = makeMockWriter();
      mux.registerClient('s1', writer);

      const p = mux.forwardFromUpstream('srv', 's1', baseRpc('rT'), { timeoutMs: 100 });
      // Attach a catch immediately so the unhandled-rejection guard
      // doesn't fire when we advance timers.
      const assertion = expect(p).rejects.toBeInstanceOf(ReverseChannelTimeoutError);
      vi.advanceTimersByTime(101);
      await assertion;
      expect(mux.pendingCountFor('s1')).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects with backpressure when pending exceeds the per-session cap', async () => {
    const mux = new ReverseChannelMux({ maxPendingPerSession: 2 });
    const writer = makeMockWriter();
    mux.registerClient('s1', writer);

    // Two are accepted (1 and 2), the third hits the cap.
    const p1 = mux.forwardFromUpstream('srv', 's1', baseRpc('1'));
    const p2 = mux.forwardFromUpstream('srv', 's1', baseRpc('2'));
    await expect(
      mux.forwardFromUpstream('srv', 's1', baseRpc('3')),
    ).rejects.toBeInstanceOf(BackpressureError);
    expect(mux.pendingCountFor('s1')).toBe(2);

    // Resolve the first to free a slot; a fourth call should now go through.
    mux.resolveFromClient('1', 's1', { jsonrpc: '2.0', id: '1', result: null });
    await p1;
    expect(mux.pendingCountFor('s1')).toBe(1);
    const p4 = mux.forwardFromUpstream('srv', 's1', baseRpc('4'));
    expect(mux.pendingCountFor('s1')).toBe(2);
    mux.resolveFromClient('2', 's1', { jsonrpc: '2.0', id: '2', result: null });
    mux.resolveFromClient('4', 's1', { jsonrpc: '2.0', id: '4', result: null });
    await Promise.all([p2, p4]);
  });

  it('throws client_not_connected when no SSE channel is registered for the session', async () => {
    const mux = new ReverseChannelMux();
    await expect(
      mux.forwardFromUpstream('srv', 'unknown', baseRpc('r')),
    ).rejects.toBeInstanceOf(ClientNotConnectedError);
  });

  it('fails all pending requests for a session when its channel unregisters', async () => {
    const mux = new ReverseChannelMux();
    const writer = makeMockWriter();
    const unregister = mux.registerClient('s1', writer);

    const p1 = mux.forwardFromUpstream('srv', 's1', baseRpc('a'));
    const p2 = mux.forwardFromUpstream('srv', 's1', baseRpc('b'));
    expect(mux.pendingCountFor('s1')).toBe(2);

    unregister();
    await expect(p1).rejects.toThrow('client_disconnected');
    await expect(p2).rejects.toThrow('client_disconnected');
    expect(mux.pendingCountFor('s1')).toBe(0);
    expect(mux.stats().activeClients).toBe(0);

    // A new forward after disconnect now fails with client_not_connected.
    await expect(
      mux.forwardFromUpstream('srv', 's1', baseRpc('c')),
    ).rejects.toBeInstanceOf(ClientNotConnectedError);
  });

  it('throws client_not_connected when the registered writer is already closed', async () => {
    const mux = new ReverseChannelMux();
    const writer = makeMockWriter();
    mux.registerClient('s1', writer);
    writer.close();
    await expect(
      mux.forwardFromUpstream('srv', 's1', baseRpc('z')),
    ).rejects.toBeInstanceOf(ClientNotConnectedError);
  });

  it('isolates pending counters per session', async () => {
    const mux = new ReverseChannelMux();
    const w1 = makeMockWriter();
    const w2 = makeMockWriter();
    mux.registerClient('s1', w1);
    mux.registerClient('s2', w2);

    const p1 = mux.forwardFromUpstream('srv', 's1', baseRpc('x'));
    const p2 = mux.forwardFromUpstream('srv', 's2', baseRpc('y'));
    expect(mux.pendingCountFor('s1')).toBe(1);
    expect(mux.pendingCountFor('s2')).toBe(1);

    // The mux gates resolution on the caller's session id (see the
    // cross-session isolation test below); getPendingSessionId still exposes
    // ownership for callers that want to check before delegating.
    expect(mux.getPendingSessionId('x')).toBe('s1');
    expect(mux.getPendingSessionId('y')).toBe('s2');

    mux.resolveFromClient('x', 's1', { jsonrpc: '2.0', id: 'x', result: 1 });
    mux.resolveFromClient('y', 's2', { jsonrpc: '2.0', id: 'y', result: 2 });
    await Promise.all([p1, p2]);
  });

  it('replacing a client writer evicts the old channel and fails its pending requests', async () => {
    const mux = new ReverseChannelMux();
    const w1 = makeMockWriter();
    const w2 = makeMockWriter();
    mux.registerClient('s1', w1);
    const p = mux.forwardFromUpstream('srv', 's1', baseRpc('x'));
    // Replace.
    mux.registerClient('s1', w2);
    await expect(p).rejects.toThrow('client_replaced');
    expect(w1.closed).toBe(true);

    // The new writer accepts traffic.
    const p2 = mux.forwardFromUpstream('srv', 's1', baseRpc('y'));
    expect(w2.sent).toHaveLength(1);
    mux.resolveFromClient('y', 's1', { jsonrpc: '2.0', id: 'y', result: 'ok' });
    await p2;
  });

  it('rejects a resolveFromClient from a different session (cross-session isolation)', async () => {
    // Security property (v0.9 spec §1.9): a second client MUST NOT be able to
    // satisfy another client's pending reverse request, even by guessing its
    // requestId. Ownership is enforced inside the mux, not the route.
    const mux = new ReverseChannelMux();
    const victim = makeMockWriter();
    const attacker = makeMockWriter();
    mux.registerClient('victim-session', victim);
    mux.registerClient('attacker-session', attacker);

    // An upstream initiates a reverse sampling request bound to the victim.
    const victimPromise = mux.forwardFromUpstream(
      'srv',
      'victim-session',
      baseRpc('reverse-1'),
    );
    expect(mux.pendingCountFor('victim-session')).toBe(1);

    // The attacker (different session) tries to answer it.
    const hijacked = mux.resolveFromClient('reverse-1', 'attacker-session', {
      jsonrpc: '2.0',
      id: 'reverse-1',
      result: 'STOLEN',
    });
    expect(hijacked).toBe(false);
    // Still pending — the attacker's response was dropped, not delivered.
    expect(mux.pendingCountFor('victim-session')).toBe(1);

    // The rightful owner resolves it.
    const accepted = mux.resolveFromClient('reverse-1', 'victim-session', {
      jsonrpc: '2.0',
      id: 'reverse-1',
      result: 'legit',
    });
    expect(accepted).toBe(true);
    expect(await victimPromise).toEqual({ jsonrpc: '2.0', id: 'reverse-1', result: 'legit' });
    expect(mux.pendingCountFor('victim-session')).toBe(0);
  });
});
